import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";
import { DispatchRepository } from "../infrastructure/dispatch.repository";
import {
  Dispatch,
  DispatchDeclineReason,
  DispatchStatus,
} from "../domain/dispatch.aggregate";
import { DispatchId } from "../domain/dispatch-id";
import {
  dispatchTimeoutSeconds,
  driverResponseTimeoutSeconds,
  normalizeDeliveryOption,
} from "../domain/delivery-option";
import {
  PlannedLeg,
  PlannedRoute,
  PlannedStop,
  RouteMatrixMetric,
  RouteStopInput,
  buildRouteNodeCoordinates,
  isRouteCompatible,
  planRouteDetailed,
} from "../domain/route-planner";
import { randomUUID } from "node:crypto";
import { MatchingEngineService } from "./matching-engine.service";
import { DriverComplianceService } from "./driver-compliance.service";
import { RoadDistanceService } from "./road-distance.service";
import {
  CreateDispatchDto,
  AssignDriverDto,
  DriverAcceptDto,
  DriverDeclineDto,
  CancelDispatchDto,
  UpdateDispatchNotesDto,
  DriverCancelDto,
  DeliveryFailedDto,
} from "./dtos/dispatch.dto";

const WALLET_SERVICE_URL =
  process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3004";
const DRIVER_SERVICE_URL =
  process.env.DRIVER_SERVICE_URL || "http://driver-service:3007";
const MIN_COD_BALANCE = 2_000_000;

/** Bán kính mặc định (km) từ GPS tài xế tới quán để được nhận đơn. */
const DEFAULT_ACCEPT_RADIUS_KM = 5;

@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private timeoutInterval: ReturnType<typeof setInterval> | null = null;
  private expireInterval: ReturnType<typeof setInterval> | null = null;
  private complianceInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly dispatchRepo: DispatchRepository,
    private readonly matchingEngine: MatchingEngineService,
    private readonly driverCompliance: DriverComplianceService,
    private readonly roadDistance: RoadDistanceService,
  ) {}

  onModuleInit(): void {
    // Re-match dispatches where the assigned driver didn't respond in time
    // (timeout theo phương thức: PRIORITY 30s, FAST 60s, SAVER 90s).
    this.timeoutInterval = setInterval(() => {
      this.handleDriverNoResponse().catch((err) =>
        this.logger.warn(`Driver no-response sweep failed: ${err.message}`),
      );
    }, 15_000);

    // Case 3: quét các dispatch đang MATCHING quá thời gian chờ → hết hạn → hủy đơn.
    this.expireInterval = setInterval(() => {
      this.expireStaleDispatches()
        .then((n) => {
          if (n > 0) this.logger.log(`Expired ${n} stale dispatches`);
        })
        .catch((err) =>
          this.logger.warn(`Stale dispatch sweep failed: ${err.message}`),
        );
    }, 15_000);

    // Đánh giá tỉ lệ từ chối / không phản hồi của tài xế (cửa sổ 30 ngày).
    // Chỉ mở case khiếu nại khi vượt ngưỡng; không tạo sự cố cho từng lần từ chối.
    this.complianceInterval = setInterval(() => {
      this.driverCompliance
        .evaluateAll()
        .then((n) => {
          if (n > 0) {
            this.logger.log(`Driver compliance: opened ${n} complaint case(s)`);
          }
        })
        .catch((err) =>
          this.logger.warn(`Driver compliance sweep failed: ${err.message}`),
        );
    }, 30 * 60_000);
  }

  onModuleDestroy(): void {
    if (this.timeoutInterval) clearInterval(this.timeoutInterval);
    if (this.expireInterval) clearInterval(this.expireInterval);
    if (this.complianceInterval) clearInterval(this.complianceInterval);
  }

  /**
   * Finds DRIVER_ASSIGNED dispatches older than their per-option timeout and
   * re-matches them (the current driver is treated as having declined silently).
   */
  async handleDriverNoResponse(): Promise<void> {
    // Lấy các dispatch đã gán quá 30 giây (ngưỡng nhỏ nhất) rồi lọc theo
    // timeout riêng của từng phương thức: PRIORITY 30s, FAST 60s, SAVER 90s.
    // Ngưỡng nhỏ nhất có thể cấu hình cho tài xế phản hồi là 10 giây.
    const cutoff = new Date(Date.now() - 10_000);
    const assigned = await this.dispatchRepo.findAssignedOlderThan(cutoff);
    const now = Date.now();

    for (const dispatch of assigned) {
      const timeoutSeconds = dispatch.dispatchDriverResponseTimeoutSeconds;
      const updatedAgo = now - (dispatch.updatedAt?.getTime() ?? now);
      if (updatedAgo < timeoutSeconds * 1000) continue;

      try {
        await this.driverDecline(
          dispatch.id.value,
          {
            driverId: dispatch.dispatchDriverId || "",
            reason: DispatchDeclineReason.OTHER,
            detail: `Không phản hồi trong ${timeoutSeconds} giây`,
          },
          true,
        );
        this.logger.log(
          `Driver ${dispatch.dispatchDriverId} timed out on dispatch ${dispatch.id.value} - re-matching`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Timeout re-match failed for ${dispatch.id.value}: ${err.message}`,
        );
      }
    }
  }

  // ---- Dispatch CRUD ----

  async createDispatch(dto: CreateDispatchDto): Promise<Dispatch> {
    const existing = await this.dispatchRepo.findByOrderId(dto.orderId);
    if (existing) {
      throw new BusinessRuleViolationError(
        "Dispatch already exists for this order",
      );
    }
    const deliveryOption = normalizeDeliveryOption(dto.deliveryOption);
    const dispatchTimeout =
      dto.dispatchTimeoutSeconds ?? dispatchTimeoutSeconds(deliveryOption);
    const driverResponseTimeout =
      dto.driverResponseTimeoutSeconds ??
      driverResponseTimeoutSeconds(deliveryOption);
    const maxStackedOrders =
      dto.maxStackedOrders ?? (deliveryOption === "SAVER" ? 3 : 1);
    const timeoutMs = dispatchTimeout * 1000;

    const dispatch = Dispatch.create({
      orderId: dto.orderId,
      merchantId: dto.merchantId,
      deliveryAddress: dto.deliveryAddress,
      deliveryLatitude: dto.deliveryLatitude,
      deliveryLongitude: dto.deliveryLongitude,
      merchantLatitude: dto.merchantLatitude,
      merchantLongitude: dto.merchantLongitude,
      expiresAt: new Date(Date.now() + timeoutMs),
      deliveryOption,
      promisedDeliveryAt: dto.promisedDeliveryAt
        ? new Date(dto.promisedDeliveryAt)
        : null,
      maxStackedOrders,
      dispatchTimeoutSeconds: dispatchTimeout,
      driverResponseTimeoutSeconds: driverResponseTimeout,
    });
    await this.dispatchRepo.save(dispatch);

    // Đã tắt auto-match: KHÔNG tự gán tài xế ngay khi tạo dispatch.
    // Tài xế sẽ tự xem danh sách đơn khả dụng rồi bấm "Nhận đơn".
    return dispatch;
  }

  /**
   * Chạy matching engine theo vòng bán kính mở rộng (1.5→3→5→7→∞ km)
   * và gán tài xế gần nhất cho dispatch đang ở trạng thái MATCHING.
   */
  async autoMatchDispatch(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    if (dispatch.dispatchStatus !== DispatchStatus.MATCHING) {
      return dispatch;
    }

    for (let ring = 0; ring < 5; ring++) {
      const result = await this.matchingEngine.findBestDriver(
        dispatch,
        ring,
        false,
      );
      if (result.matched && result.driver) {
        dispatch.assignDriver(result.driver.driverId);
        await this.dispatchRepo.save(dispatch);
        await this.driverCompliance.recordOffer(
          result.driver.driverId,
          dispatch.id.value,
          dispatch.dispatchOrderId,
        );
        this.logger.log(
          `Auto-assigned driver ${result.driver.driverId} (${result.driver.distanceKm.toFixed(2)} km) to dispatch ${id}`,
        );
        return dispatch;
      }
    }
    return dispatch;
  }

  async getById(id: string): Promise<Dispatch> {
    const dispatchId = DispatchId.from(id);
    return this.dispatchRepo.findByIdOrFail(dispatchId);
  }

  async getByOrderId(orderId: string): Promise<Dispatch | null> {
    return this.dispatchRepo.findByOrderId(orderId);
  }

  async getByDriverId(driverId: string): Promise<Dispatch[]> {
    return this.dispatchRepo.findByDriverId(driverId);
  }

  async getByMerchantId(merchantId: string): Promise<Dispatch[]> {
    return this.dispatchRepo.findByMerchantId(merchantId);
  }

  async getAll(filter?: {
    status?: string;
    driverId?: string;
    orderId?: string;
    skip?: number;
    take?: number;
  }): Promise<Dispatch[]> {
    return this.dispatchRepo.findAll(filter);
  }

  async getActiveDispatches(): Promise<Dispatch[]> {
    return this.dispatchRepo.findActiveDispatches();
  }

  async getMatchingDispatches(): Promise<Dispatch[]> {
    return this.dispatchRepo.findMatchingDispatches();
  }

  /**
   * Danh sách dispatch mà tài xế **thực sự nhận được ngay lúc này**.
   *
   * Dùng cho driver-app để chỉ hiển thị đơn hợp lệ:
   * - Đơn còn `MATCHING` và tài xế đạt điều kiện: đang rảnh (FAST/PRIORITY),
   *   hoặc đang giữ toàn đơn SAVER còn slot + đơn mới cùng tuyến (gộp đơn).
   * - Đơn đang chờ chính tài xế phản hồi (`DRIVER_ASSIGNED`).
   *
   * Đơn đã gán cho tài xế khác, đơn tài xế đã từ chối/không phản hồi trước đó
   * và đơn không thỏa luật gộp sẽ KHÔNG trả về → app không hiện để bấm nhận.
   */
  async getAvailableDispatchesForDriver(driverId: string): Promise<Dispatch[]> {
    const driver = await this.fetchDriver(driverId);
    if (!driver) return [];

    const maxRadiusKm = this.acceptRadiusKm();
    // Đơn tài xế đã chủ động từ chối (bền vững theo order, kể cả khi dispatch
    // bị xoá/tạo lại) → không bao giờ hiện lại để bấm nhận/gộp.
    const declinedOrderIds = await this.declinedOrderIdsFor(driverId);
    const activeDispatches =
      await this.dispatchRepo.findActiveByDriverId(driverId);
    const matchingDispatches = await this.dispatchRepo.findMatchingDispatches();
    const assignedToDriver = activeDispatches.filter(
      (d) =>
        d.dispatchStatus === DispatchStatus.DRIVER_ASSIGNED &&
        d.dispatchDriverId === driverId,
    );

    const seen = new Set<string>();
    const available: Dispatch[] = [];

    for (const dispatch of [...assignedToDriver, ...matchingDispatches]) {
      if (seen.has(dispatch.id.value)) continue;
      seen.add(dispatch.id.value);

      // Đơn đã có chủ khác thì không hiển thị cho tài xế này.
      if (dispatch.dispatchDriverId && dispatch.dispatchDriverId !== driverId) {
        continue;
      }

      // Đơn tài xế đã từ chối trước đó (kể cả dispatch đã được tạo lại với
      // matchedDriverIds rỗng) → không hiện lại.
      if (declinedOrderIds.has(dispatch.dispatchOrderId)) {
        continue;
      }

      // Đơn từng được offer cho tài xế này rồi quay lại MATCHING (từ chối /
      // không phản hồi) → không hiện lại trong phiên.
      if (
        dispatch.dispatchStatus === DispatchStatus.MATCHING &&
        dispatch.dispatchMatchedDriverIds.includes(driverId)
      ) {
        continue;
      }

      // Điều kiện khoảng cách: chỉ hiển thị đơn nằm trong bán kính nhận đơn
      // tính từ GPS hiện tại của tài xế tới quán (thiếu GPS → bỏ qua, để
      // tài xế vừa bật ONLINE vẫn thấy đơn trong lúc chờ tick GPS đầu tiên).
      const distanceKm = this.pickupDistanceKm(driver, dispatch);
      if (distanceKm != null && distanceKm > maxRadiusKm) continue;

      const eligible = await this.checkDriverAvailability(
        driverId,
        dispatch,
        driver,
        activeDispatches,
      );
      if (eligible) available.push(dispatch);
    }

    // Đơn đang chờ chính tài xế phản hồi luôn đứng đầu (tránh hết thời gian
    // phản hồi), sau đó tới đơn gần quán nhất (“Đơn gần bạn”).
    return available.sort((a, b) => {
      const assignedA =
        a.dispatchStatus === DispatchStatus.DRIVER_ASSIGNED ? 0 : 1;
      const assignedB =
        b.dispatchStatus === DispatchStatus.DRIVER_ASSIGNED ? 0 : 1;
      if (assignedA !== assignedB) return assignedA - assignedB;

      const distanceA =
        this.pickupDistanceKm(driver, a) ?? Number.POSITIVE_INFINITY;
      const distanceB =
        this.pickupDistanceKm(driver, b) ?? Number.POSITIVE_INFINITY;
      return distanceA - distanceB;
    });
  }

  async updateNotes(
    id: string,
    dto: UpdateDispatchNotesDto,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.updateNotes(dto.notes);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async deleteDispatch(id: string): Promise<void> {
    const dispatchId = DispatchId.from(id);
    await this.dispatchRepo.deleteById(dispatchId);
  }

  // ---- Matching Engine ----

  async assignDriver(
    id: string,
    dto: AssignDriverDto,
    _isCodOrder: boolean = false,
    authToken?: string,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );

    // Đơn đã được gán cho chính tài xế này (vd: matching engine gán trước,
    // hoặc app gọi lại do dữ liệu vừa đổi trạng thái) → trả về luôn.
    if (
      dispatch.dispatchStatus === DispatchStatus.DRIVER_ASSIGNED &&
      dispatch.dispatchDriverId === dto.driverId
    ) {
      return dispatch;
    }

    // Tài xế đã chủ động từ chối đơn này trước đó → không được nhận lại.
    // Kiểm tra theo order (không chỉ theo dispatch) vì driver-app có thể xoá
    // dispatch cũ (EXPIRED/CANCELLED) và tạo dispatch mới với matchedDriverIds
    // rỗng → nếu chỉ dựa vào aggregate thì đơn đã từ chối sẽ "sống lại".
    if (dispatch.dispatchStatus === DispatchStatus.MATCHING) {
      const declinedOrderIds = await this.declinedOrderIdsFor(dto.driverId);
      if (declinedOrderIds.has(dispatch.dispatchOrderId)) {
        throw new BusinessRuleViolationError(
          "Bạn đã từ chối đơn này nên không thể nhận lại",
        );
      }
    }

    // Kiểm tra điều kiện nhận đơn TRƯỚC khi gán. Trước đây dispatch bị gán
    // cho tài xế rồi mới bị `driver-accept` từ chối (đang bận, hết slot gộp,
    // ngoài tuyến gộp...) → đơn bị kẹt ở DRIVER_ASSIGNED cho tới khi hết thời
    // gian phản hồi. Kiểm tra sớm giúp đơn vẫn ở MATCHING cho tài xế khác.
    if (dispatch.dispatchStatus === DispatchStatus.MATCHING) {
      const available = await this.checkDriverAvailability(
        dto.driverId,
        dispatch,
      );
      if (!available) {
        throw new BusinessRuleViolationError(
          "Tài xế chưa đủ điều kiện nhận đơn này (đang bận đơn khác, hết slot gộp hoặc đơn ngoài tuyến gộp)",
        );
      }
    }

    // Check if this order is COD by querying the order service
    let isCodOrder = _isCodOrder;
    try {
      const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
      const orderUrl = `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}`;
      this.logger.log(`🔍 [COD-DEBUG] Querying order: ${orderUrl}`);
      const orderRes = await fetch(orderUrl, {
        headers: { "x-service-key": serviceKey },
      });
      if (orderRes.ok) {
        const orderData = (await orderRes.json()) as any;
        const paymentMethod =
          orderData?.paymentMethod || orderData?.data?.paymentMethod;
        isCodOrder = paymentMethod === "CASH" || paymentMethod === "COD";
        this.logger.log(
          `🔍 [COD-DEBUG] Order ${dispatch.dispatchOrderId} paymentMethod=${paymentMethod} → isCodOrder=${isCodOrder}`,
        );
      } else {
        this.logger.warn(
          `🔍 [COD-DEBUG] Order query failed: HTTP ${orderRes.status} (fallback isCodOrder=${_isCodOrder})`,
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `🔍 [COD-DEBUG] Order query error: ${err.message} (fallback isCodOrder=${_isCodOrder})`,
      );
    }

    // Check COD eligibility before assigning driver
    if (isCodOrder && dto.driverId) {
      this.logger.log(
        `🔍 [COD-DEBUG] Checking COD eligibility for driver ${dto.driverId}...`,
      );
      const isEligible = await this.checkCodEligibility(
        dto.driverId,
        authToken,
      );
      if (!isEligible) {
        this.logger.warn(
          `🔍 [COD-DEBUG] Driver ${dto.driverId} NOT eligible for COD`,
        );
        throw new BusinessRuleViolationError(
          `Driver ${dto.driverId} does not meet COD requirements (min balance: ${MIN_COD_BALANCE.toLocaleString("vi-VN")} VND)`,
        );
      }
      this.logger.log(
        `🔍 [COD-DEBUG] Driver ${dto.driverId} passed COD check ✅`,
      );
    } else {
      this.logger.log(
        `🔍 [COD-DEBUG] Skipping COD check: isCodOrder=${isCodOrder}, hasDriver=${!!dto.driverId}`,
      );
    }

    dispatch.assignDriver(dto.driverId);
    await this.dispatchRepo.save(dispatch);
    await this.driverCompliance.recordOffer(
      dto.driverId,
      dispatch.id.value,
      dispatch.dispatchOrderId,
    );
    return dispatch;
  }

  /**
   * Check if a driver's wallet balance meets COD requirements.
   * Calls wallet-service API: GET /api/v1/wallets/check-cod-eligibility/:driverId
   */
  private async checkCodEligibility(
    driverId: string,
    authToken?: string,
  ): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const response = await fetch(
        `${WALLET_SERVICE_URL}/api/v1/wallets/check-cod-eligibility/${driverId}`,
        { headers },
      );

      if (!response.ok) {
        this.logger.warn(
          `Wallet check-cod-eligibility returned ${response.status} for driver ${driverId}`,
        );
        return false;
      }

      const data = (await response.json()) as {
        eligible?: boolean;
        balance?: number;
      };
      if (typeof data.eligible === "boolean") {
        return data.eligible;
      }

      // Fallback: check balance manually
      if (typeof data.balance === "number") {
        return data.balance >= MIN_COD_BALANCE;
      }

      return false;
    } catch (error: any) {
      this.logger.error(
        `Failed to check COD eligibility for driver ${driverId}: ${error.message}`,
      );
      // SAFETY: If wallet service is unavailable, REJECT the assignment
      // to prevent drivers with insufficient balance from taking COD orders
      this.logger.warn(
        `Wallet service unavailable - REJECTING COD assignment for driver ${driverId} (fail-safe)`,
      );
      return false;
    }
  }

  async driverAccept(id: string, dto?: DriverAcceptDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    const driverId = dispatch.dispatchDriverId;
    if (!driverId) {
      throw new BusinessRuleViolationError(
        "No driver assigned to this dispatch",
      );
    }

    // GPS gửi kèm lúc bấm “Nhận đơn” → cập nhật ngay để kiểm tra bán kính
    // bằng toạ độ mới nhất (không phụ thuộc nhịp heartbeat 5 giây).
    if (dto?.latitude != null && dto?.longitude != null) {
      await this.updateDriverLocation(driverId, dto.latitude, dto.longitude);
    }

    // Điều kiện khoảng cách: tài xế phải ở trong bán kính nhận đơn tính từ
    // GPS hiện tại tới điểm lấy hàng (quán).
    const driver = await this.fetchDriver(driverId);
    const distanceKm = this.pickupDistanceKm(driver, dispatch);
    const maxRadiusKm = this.acceptRadiusKm();
    if (distanceKm != null && distanceKm > maxRadiusKm) {
      throw new BusinessRuleViolationError(
        `Tài xế đang cách quán ${distanceKm.toFixed(1)} km — vượt bán kính nhận đơn ${maxRadiusKm} km`,
      );
    }

    // Case 5: tài xế đang bận / bị khóa / hết slot gộp thì không cho nhận.
    const available = await this.checkDriverAvailability(
      driverId,
      dispatch,
      driver ?? undefined,
    );
    if (!available) {
      throw new BusinessRuleViolationError(
        "Tài xế đang có đơn khác, hết slot gộp hoặc bị tạm khóa nhận đơn",
      );
    }

    // Case 6: chốt đơn nguyên tử — đảm bảo 1 đơn chỉ 1 tài xế nhận được.
    const accepted = await this.dispatchRepo.acceptAtomic(id);
    if (!accepted) {
      throw new ConflictException("Đơn đã được tài xế khác nhận");
    }

    // Đánh dấu tài xế bận / thêm đơn vào danh sách đang giữ.
    await this.markDriverBusy(
      driverId,
      dispatch.dispatchOrderId,
      dispatch.dispatchMaxStackedOrders,
    );

    // Ghi nhận offer đã được tài xế nhận (phục vụ tỉ lệ tháng).
    await this.driverCompliance.markAccepted(
      driverId,
      id,
      dispatch.dispatchOrderId,
    );

    // SAVER: gán lô + xếp lại thứ tự điểm dừng cho cả lộ trình.
    await this.refreshDriverRoute(driverId);

    // Báo order-service gán tài xế cho đơn để đơn biết "đã có tài xế"
    // (tránh bị hủy nhầm do hết thời gian chờ tài xế).
    await this.notifyOrderDriverAssigned(dispatch);

    return this.dispatchRepo.findByIdOrFail(DispatchId.from(id));
  }

  /**
   * Case 7: tài xế đã nhận đơn nhưng hủy → ghi lý do, phạt tài xế,
   * đưa đơn quay lại tìm tài xế khác.
   */
  async driverCancelAfterAccept(
    id: string,
    dto: DriverCancelDto,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    const driverId = dispatch.dispatchDriverId;
    dispatch.driverCancelAfterAccept(dto.reason);
    await this.dispatchRepo.save(dispatch);

    if (driverId) {
      await this.penalizeDriver(driverId);
      await this.releaseDriver(driverId, dispatch.dispatchOrderId);
      await this.refreshDriverRoute(driverId);
    }

    // Báo order-service ghi lý do vào lịch sử + thông báo khách hàng.
    await this.notifyOrderDriverCancel(dispatch, dto.reason);

    if (dispatch.dispatchStatus === DispatchStatus.EXPIRED) {
      await this.notifyOrderNoDriver(dispatch);
      return dispatch;
    }

    if (dispatch.hasRemainingRetries) {
      try {
        const rematched = await this.autoMatchDispatch(id);
        // Tìm không ra tài xế mới → hủy đơn ngay (Case 3).
        if (rematched.dispatchStatus === DispatchStatus.MATCHING) {
          rematched.expire();
          await this.dispatchRepo.save(rematched);
          await this.notifyOrderNoDriver(rematched);
        }
        return rematched;
      } catch {
        /* ignore */
      }
    }
    return dispatch;
  }

  /**
   * Case 8: tài xế giao hàng thất bại (khách không nhận hàng).
   */
  async deliveryFailed(id: string, dto: DeliveryFailedDto): Promise<Dispatch> {
    if (dto.faultParty === "CUSTOMER" && !dto.photoUrl) {
      throw new BadRequestException(
        "Ảnh bằng chứng là bắt buộc khi báo giao thất bại do lỗi khách",
      );
    }
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.deliveryFailed(dto.reason);
    await this.dispatchRepo.save(dispatch);

    await this.notifyOrderDeliveryFailed(
      dispatch,
      dto.reason,
      dto.photoUrl,
      dto.faultParty,
    );

    const driverId = dispatch.dispatchDriverId;
    if (driverId) {
      await this.releaseDriver(driverId, dispatch.dispatchOrderId);
      await this.refreshDriverRoute(driverId);
    }

    return dispatch;
  }

  async driverDecline(
    id: string,
    dto: DriverDeclineDto,
    noResponse = false,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    const declinedDriverId = dispatch.dispatchDriverId || dto.driverId;
    const orderId = dispatch.dispatchOrderId;
    dispatch.driverDecline(dto.reason, dto.detail);
    await this.dispatchRepo.save(dispatch);

    // Ghi nhận lượt từ chối/không phản hồi để tính tỉ lệ tháng.
    // Không mở case tại đây — case chỉ mở khi tỉ lệ vượt ngưỡng.
    if (declinedDriverId) {
      await this.driverCompliance.markDeclined({
        driverId: declinedDriverId,
        dispatchId: id,
        orderId,
        noResponse,
        reason: dto.reason,
      });
    }

    // Hết lượt tìm tài xế → không còn tài xế nhận đơn → hủy đơn (Case 3).
    if (dispatch.dispatchStatus === DispatchStatus.EXPIRED) {
      await this.notifyOrderNoDriver(dispatch);
      return dispatch;
    }

    // Tự tìm tài xế khác khi còn lượt retry
    if (dispatch.hasRemainingRetries) {
      try {
        return await this.autoMatchDispatch(id);
      } catch {
        /* ignore */
      }
    }
    return dispatch;
  }

  /**
   * Case 4: ghi nhận tài xế đã từ chối (dù dispatch ở trạng thái nào)
   * để matching engine không gán lại cho họ.
   */
  async recordDriverDecline(id: string, driverId: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    // Ghi nhận tài xế đã chủ động từ chối đơn đang hiển thị cho họ.
    // Với mô hình tài xế tự chọn đơn, thao tác "Từ chối" chính là một quyết
    // định thật của tài xế nên được tính vào tỉ lệ (khác với việc bỏ qua đơn).
    // Unique (driver_id, dispatch_id) đảm bảo không đếm trùng khi UI gọi thêm
    // driverDecline ngay sau đó.
    const orderId = dispatch.dispatchOrderId;
    dispatch.recordDriverDecline(driverId);
    await this.dispatchRepo.save(dispatch);
    await this.driverCompliance.markDeclined({
      driverId,
      dispatchId: id,
      orderId,
      reason: "OTHER",
    });
    return dispatch;
  }

  /** Danh sách orderId mà tài xế đã từ chối (Case 4). */
  async getDeclinedOrderIds(driverId: string): Promise<string[]> {
    const declined = await this.declinedOrderIdsFor(driverId);
    return [...declined];
  }

  /**
   * Hợp nhất 2 nguồn "tài xế đã từ chối":
   * - `dispatches.matchedDriverIds` (theo dispatch hiện tại),
   * - `driver_dispatch_offers` (theo order, sống sót khi dispatch bị xoá/tạo lại).
   */
  private async declinedOrderIdsFor(driverId: string): Promise<Set<string>> {
    const [fromDispatches, fromOffers] = await Promise.all([
      this.dispatchRepo
        .findDeclinedOrderIdsByDriver(driverId)
        .catch(() => [] as string[]),
      this.driverCompliance
        .getDeclinedOrderIds(driverId)
        .catch(() => [] as string[]),
    ]);
    return new Set(
      [...(fromDispatches ?? []), ...(fromOffers ?? [])].filter(Boolean),
    );
  }

  // ---- Dispatch Lifecycle ----

  async driverArrived(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.driverArrived();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async markPickedUp(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.markPickedUp();
    await this.dispatchRepo.save(dispatch);

    // Lấy món xong → tính lại lộ trình còn lại (các chặng giao hàng).
    const driverId = dispatch.dispatchDriverId;
    if (driverId) {
      try {
        await this.refreshDriverRoute(driverId);
      } catch (err: any) {
        this.logger.warn(
          `refreshDriverRoute after pickup failed for ${driverId}: ${err.message}`,
        );
      }
    }
    return dispatch;
  }

  async startDelivering(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.startDelivering();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async markDelivered(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.markDelivered();
    await this.dispatchRepo.save(dispatch);

    // Ghi nhận hoàn thành đúng đơn (hỗ trợ SAVER stacking) + xếp lại lộ trình.
    const driverId = dispatch.dispatchDriverId;
    if (driverId) {
      await this.completeDriverOrder(driverId, dispatch.dispatchOrderId);
      await this.refreshDriverRoute(driverId);
    }
    return dispatch;
  }

  async expireDispatch(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.expire();
    await this.dispatchRepo.save(dispatch);
    await this.notifyOrderNoDriver(dispatch);
    return dispatch;
  }

  async cancelDispatch(id: string, dto: CancelDispatchDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    const driverId = dispatch.dispatchDriverId;
    dispatch.cancel(dto.reason);
    await this.dispatchRepo.save(dispatch);

    if (driverId) {
      await this.releaseDriver(driverId, dispatch.dispatchOrderId);
      await this.refreshDriverRoute(driverId);
    }
    return dispatch;
  }

  /**
   * Case 3: khi dispatch hết thời gian chờ mà không có tài xế nhận,
   * báo order-service hủy đơn với trạng thái CANCELLED_NO_DRIVER.
   */
  private async notifyOrderNoDriver(dispatch: Dispatch): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}/cancel-no-driver`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({}),
        },
      );
      this.logger.log(
        `Notified order ${dispatch.dispatchOrderId} as CANCELLED_NO_DRIVER`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to notify no-driver cancellation for order ${dispatch.dispatchOrderId}: ${err.message}`,
      );
    }
  }

  /**
   * Báo order-service gán tài xế cho đơn (khi tài xế đã nhận đơn) để đơn biết
   * "đã có tài xế" và không bị hủy nhầm do hết thời gian chờ tài xế.
   */
  private async notifyOrderDriverAssigned(dispatch: Dispatch): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}/assign-driver`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ driverId: dispatch.dispatchDriverId }),
        },
      );
      this.logger.log(
        `Notified order ${dispatch.dispatchOrderId} assigned driver ${dispatch.dispatchDriverId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `notifyOrderDriverAssigned failed for order ${dispatch.dispatchOrderId}: ${err.message}`,
      );
    }
  }

  /** Lấy dữ liệu tài xế từ driver-service (server-to-server). */
  private async fetchDriver(driverId: string): Promise<any | null> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      const res = await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}`,
        { headers: { "x-service-key": serviceKey } },
      );
      if (!res.ok) return null;
      const json: any = await res.json();
      return json?.data ?? json;
    } catch {
      return null;
    }
  }

  /**
   * Cập nhật GPS mới nhất của tài xế sang driver-service ngay khi bấm nhận
   * đơn. Best-effort: lỗi mạng/driver-service không chặn việc nhận đơn —
   * khi đó hệ thống dùng toạ độ gần nhất đang lưu.
   */
  private async updateDriverLocation(
    driverId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      const res = await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}/location`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ latitude, longitude }),
        },
      );
      if (!res.ok) {
        this.logger.warn(
          `updateDriverLocation ${driverId} failed: HTTP ${res.status}`,
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `updateDriverLocation failed for ${driverId}: ${err.message}`,
      );
    }
  }

  private activeOrderIdsOf(driver: any): string[] {
    if (
      Array.isArray(driver?.currentOrderIds) &&
      driver.currentOrderIds.length > 0
    ) {
      return driver.currentOrderIds;
    }
    return driver?.currentOrderId ? [driver.currentOrderId] : [];
  }

  private saverStackRadiusKm(): number {
    const value = Number(process.env.SAVER_STACK_RADIUS_KM || 3);
    return Number.isFinite(value) && value > 0 ? value : 3;
  }

  private saverPickupRadiusKm(): number {
    const fallback = this.saverStackRadiusKm();
    const value = Number(process.env.SAVER_PICKUP_RADIUS_KM || fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private saverMaxDetourKm(): number {
    const value = Number(process.env.SAVER_MAX_DETOUR_KM || 3);
    return Number.isFinite(value) && value >= 0 ? value : 3;
  }

  /**
   * Bán kính tối đa (km) từ GPS hiện tại của tài xế tới quán để được nhận đơn.
   * Cấu hình qua `DISPATCH_MAX_RADIUS_KM`, mặc định 5km.
   */
  private acceptRadiusKm(): number {
    const value = Number(
      process.env.DISPATCH_MAX_RADIUS_KM || DEFAULT_ACCEPT_RADIUS_KM,
    );
    return Number.isFinite(value) && value > 0
      ? value
      : DEFAULT_ACCEPT_RADIUS_KM;
  }

  /** Chuẩn hoá cặp toạ độ; null/undefined/NaN đều bị loại (tránh (0,0) giả). */
  private parseCoordinates(
    lat: unknown,
    lng: unknown,
  ): { lat: number; lng: number } | null {
    if (lat == null || lng == null) return null;
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return null;
    }
    return { lat: parsedLat, lng: parsedLng };
  }

  /** GPS hiện tại của tài xế (null nếu chưa có / không hợp lệ). */
  private driverCoordinates(driver: any): { lat: number; lng: number } | null {
    return this.parseCoordinates(
      driver?.currentLatitude,
      driver?.currentLongitude,
    );
  }

  /**
   * Toạ độ điểm lấy hàng: ưu tiên toạ độ quán, fallback toạ độ giao hàng cho
   * dispatch cũ chưa có toạ độ quán (trước đây matching đo tới khách).
   */
  private pickupCoordinates(
    dispatch: Dispatch,
  ): { lat: number; lng: number } | null {
    return (
      this.parseCoordinates(
        dispatch.dispatchMerchantLatitude,
        dispatch.dispatchMerchantLongitude,
      ) ??
      this.parseCoordinates(
        dispatch.dispatchDeliveryLatitude,
        dispatch.dispatchDeliveryLongitude,
      )
    );
  }

  /** Khoảng cách (km) từ GPS tài xế tới quán — null nếu thiếu toạ độ. */
  private pickupDistanceKm(driver: any, dispatch: Dispatch): number | null {
    const from = this.driverCoordinates(driver);
    const to = this.pickupCoordinates(dispatch);
    if (!from || !to) return null;
    return this._haversineDistance(from.lat, from.lng, to.lat, to.lng);
  }

  private toRouteStop(dispatch: Dispatch): RouteStopInput {
    return {
      orderId: dispatch.dispatchOrderId,
      merchantLatitude: dispatch.dispatchMerchantLatitude,
      merchantLongitude: dispatch.dispatchMerchantLongitude,
      deliveryLatitude: dispatch.dispatchDeliveryLatitude,
      deliveryLongitude: dispatch.dispatchDeliveryLongitude,
      status: dispatch.dispatchStatus,
      priorityRank: dispatch.dispatchPriorityRank,
    };
  }

  /**
   * Kiểm tra tài xế có được nhận dispatch này không:
   * - FAST/PRIORITY: phải đang rảnh hoàn toàn.
   * - SAVER: được gộp nếu còn slot, các đơn đang giữ đều SAVER và điểm giao
   *   mới nằm trong hành lang lộ trình hiện tại.
   *
   * `driverProfile` / `activeDispatches` cho phép tái sử dụng dữ liệu đã tải
   * (vd: khi lọc cả danh sách đơn khả dụng) để tránh gọi HTTP lặp lại.
   */
  private async checkDriverAvailability(
    driverId: string,
    dispatch: Dispatch,
    driverProfile?: any,
    activeDispatches?: Dispatch[],
  ): Promise<boolean> {
    const driver = driverProfile ?? (await this.fetchDriver(driverId));
    if (!driver) return false;

    if (driver.status !== "ACTIVE" || driver.onlineStatus !== "ONLINE") {
      return false;
    }
    if (driver.fatigueLevel === "CRITICAL") return false;
    if (
      driver.acceptBlockedUntil &&
      new Date(driver.acceptBlockedUntil).getTime() > Date.now()
    ) {
      return false;
    }

    const active =
      activeDispatches ??
      (await this.dispatchRepo.findActiveByDriverId(driverId));

    // Hợp nhất đơn đang giữ từ dispatch-service (nguồn sự thật về trạng thái
    // dispatch) và driver-service (có thể còn đơn cũ chưa kịp giải phóng).
    const activeOrderIds = new Set<string>(
      active
        .map((d) => d.dispatchOrderId)
        .filter((orderId) => orderId !== dispatch.dispatchOrderId),
    );
    for (const orderId of this.activeOrderIdsOf(driver)) {
      if (orderId !== dispatch.dispatchOrderId) activeOrderIds.add(orderId);
    }

    const maxConcurrent = Math.max(
      1,
      Number(dispatch.dispatchMaxStackedOrders) || 1,
    );

    if (dispatch.dispatchDeliveryOption !== "SAVER") {
      return activeOrderIds.size === 0;
    }

    if (activeOrderIds.size >= maxConcurrent) return false;
    if (activeOrderIds.size === 0) return true;

    const stops = active
      .filter((d) => d.dispatchOrderId !== dispatch.dispatchOrderId)
      .map((d) => this.toRouteStop(d));
    if (stops.length === 0) return true;

    if (
      active.some(
        (d) =>
          d.dispatchOrderId !== dispatch.dispatchOrderId &&
          d.dispatchDeliveryOption !== "SAVER",
      )
    ) {
      return false;
    }

    return isRouteCompatible(
      Number(driver.currentLatitude ?? dispatch.dispatchMerchantLatitude),
      Number(driver.currentLongitude ?? dispatch.dispatchMerchantLongitude),
      stops,
      {
        orderId: dispatch.dispatchOrderId,
        merchantLatitude: dispatch.dispatchMerchantLatitude,
        merchantLongitude: dispatch.dispatchMerchantLongitude,
        deliveryLatitude: dispatch.dispatchDeliveryLatitude,
        deliveryLongitude: dispatch.dispatchDeliveryLongitude,
        status: dispatch.dispatchStatus,
      },
      {
        maxDropoffDeviationKm: this.saverStackRadiusKm(),
        maxPickupDeviationKm: this.saverPickupRadiusKm(),
        maxDetourKm: this.saverMaxDetourKm(),
      },
    );
  }

  private async markDriverBusy(
    driverId: string,
    orderId: string,
    maxConcurrentOrders = 1,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}/assign-order`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ orderId, maxConcurrentOrders }),
        },
      );
    } catch (err: any) {
      this.logger.warn(`markDriverBusy failed for ${driverId}: ${err.message}`);
    }
  }

  /** Đánh dấu hoàn thành đúng 1 đơn của tài xế (SAVER stacking). */
  private async completeDriverOrder(
    driverId: string,
    orderId: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}/complete-order`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ orderId }),
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `completeDriverOrder failed for ${driverId}: ${err.message}`,
      );
    }
  }

  /** Giải phóng 1 đơn (hoặc toàn bộ nếu không truyền orderId). */
  private async releaseDriver(
    driverId: string,
    orderId?: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}/release-order`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify(orderId ? { orderId } : {}),
        },
      );
    } catch (err: any) {
      this.logger.warn(`releaseDriver failed for ${driverId}: ${err.message}`);
    }
  }

  private async getDriverLocation(
    driverId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const driver = await this.fetchDriver(driverId);
    // Không dùng Number() trực tiếp: Number(null) === 0 sẽ biến "chưa có GPS"
    // thành toạ độ (0,0) và làm lộ trình bắt đầu từ giữa đại dương.
    return this.driverCoordinates(driver);
  }

  /**
   * Tính lại lô + thứ tự điểm dừng cho toàn bộ đơn tài xế đang giữ.
   * - >=2 đơn SAVER → dùng chung batchId + lộ trình tối ưu (pickup/dropoff
   *   có thể đan xen, miễn lấy món trước khi giao của chính đơn đó).
   * - Còn 0–1 đơn → xóa batch.
   */
  /**
   * Tính lộ trình tối ưu cho tài xế từ vị trí hiện tại qua toàn bộ đơn đang
   * giữ. Với lô gộp ≥2 đơn, dùng ma trận khoảng cách/thời gian đường đi thực
   * tế (OSRM/Google) để tối ưu theo giao thông; lỗi dịch vụ → Haversine.
   */
  private async planDriverRoute(
    driverId: string,
    active: Dispatch[],
  ): Promise<PlannedRoute> {
    const location = await this.getDriverLocation(driverId);
    const startLat = location?.lat ?? active[0]!.dispatchMerchantLatitude;
    const startLng = location?.lng ?? active[0]!.dispatchMerchantLongitude;
    const stops = active.map((d) => this.toRouteStop(d));

    let matrix: RouteMatrixMetric | null = null;
    if (active.length >= 2) {
      const nodeCoordinates = buildRouteNodeCoordinates(stops);
      matrix = await this.roadDistance.getMatrix([
        { latitude: startLat, longitude: startLng },
        ...nodeCoordinates,
      ]);
    }

    return planRouteDetailed(startLat, startLng, stops, matrix ?? undefined);
  }

  async refreshDriverRoute(driverId: string): Promise<{
    batchId: string | null;
    stops: PlannedStop[];
    legs: PlannedLeg[];
    totalDistanceKm: number;
    totalDurationMin: number;
    source: PlannedRoute["source"];
  }> {
    const active = await this.dispatchRepo.findActiveByDriverId(driverId);
    if (active.length === 0) {
      return {
        batchId: null,
        stops: [],
        legs: [],
        totalDistanceKm: 0,
        totalDurationMin: 0,
        source: "haversine",
      };
    }

    const planned = await this.planDriverRoute(driverId, active);
    const allSaver = active.every((d) => d.dispatchDeliveryOption === "SAVER");
    if (active.length < 2 || !allSaver) {
      for (const dispatch of active) {
        if (
          dispatch.dispatchBatchId != null ||
          dispatch.dispatchRouteSequence != null
        ) {
          dispatch.clearBatch();
          await this.dispatchRepo.save(dispatch);
        }
      }
      return {
        batchId: null,
        stops: planned.stops,
        legs: planned.legs,
        totalDistanceKm: planned.totalDistanceKm,
        totalDurationMin: planned.totalDurationMin,
        source: planned.source,
      };
    }

    const batchId =
      active.find((d) => d.dispatchBatchId)?.dispatchBatchId ?? randomUUID();

    for (const stop of planned.stops) {
      const dispatch = active.find((d) => d.dispatchOrderId === stop.orderId);
      if (!dispatch) continue;
      dispatch.assignBatch(batchId, stop.sequence);
      await this.dispatchRepo.save(dispatch);
    }

    return {
      batchId,
      stops: planned.stops,
      legs: planned.legs,
      totalDistanceKm: planned.totalDistanceKm,
      totalDurationMin: planned.totalDurationMin,
      source: planned.source,
    };
  }

  /** Lộ trình gộp đơn hiện tại của tài xế (driver-app). */
  async getDriverRoute(driverId: string): Promise<{
    driverId: string;
    batchId: string | null;
    maxStackedOrders: number;
    stops: PlannedStop[];
    legs: PlannedLeg[];
    totalDistanceKm: number;
    totalDurationMin: number;
    source: PlannedRoute["source"];
  }> {
    const active = await this.dispatchRepo.findActiveByDriverId(driverId);
    if (active.length === 0) {
      return {
        driverId,
        batchId: null,
        maxStackedOrders: 1,
        stops: [],
        legs: [],
        totalDistanceKm: 0,
        totalDurationMin: 0,
        source: "haversine",
      };
    }

    const planned = await this.planDriverRoute(driverId, active);

    return {
      driverId,
      batchId: active[0]!.dispatchBatchId,
      maxStackedOrders: active[0]!.dispatchMaxStackedOrders,
      stops: planned.stops.map((stop) => ({
        ...stop,
        status:
          active.find((d) => d.dispatchOrderId === stop.orderId)
            ?.dispatchStatus ?? stop.status,
      })),
      legs: planned.legs.map((leg) => ({
        ...leg,
        status:
          active.find((d) => d.dispatchOrderId === leg.orderId)
            ?.dispatchStatus ?? leg.status,
      })),
      totalDistanceKm: planned.totalDistanceKm,
      totalDurationMin: planned.totalDurationMin,
      source: planned.source,
    };
  }

  /** Tỉ lệ từ chối / không phản hồi của tài xế trong N ngày (admin). */
  async getDriverComplianceView(days?: number) {
    return this.driverCompliance.getComplianceView(days);
  }

  /** Chạy đánh giá ngay (admin) — chỉ mở case khi vượt ngưỡng. */
  async evaluateDriverCompliance(): Promise<number> {
    return this.driverCompliance.evaluateAll();
  }

  /** Thống kê gộp đơn SAVER trong N ngày gần nhất. */
  async getStackingStats(days = 30): Promise<{
    days: number;
    batches: number;
    stackedDispatches: number;
    totalDispatches: number;
    avgRouteSequence: number;
  }> {
    const safeDays = Math.min(365, Math.max(1, Number(days) || 30));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const stats = await this.dispatchRepo.getStackingStats(since);
    return { days: safeDays, ...stats };
  }

  /** Lộ trình của một dispatch (dùng cho trang giao hàng). */
  async getDispatchRoute(id: string): Promise<any> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    const driverId = dispatch.dispatchDriverId;
    if (!driverId) {
      return {
        dispatchId: id,
        batchId: null,
        maxStackedOrders: dispatch.dispatchMaxStackedOrders,
        stops: [
          {
            ...this.toRouteStop(dispatch),
            sequence: 1,
            pickupDone: false,
            deliveryDone: false,
            pickupSequence: null,
            dropoffSequence: null,
          },
        ],
        legs: [],
        totalDistanceKm: 0,
        totalDurationMin: 0,
        source: "haversine",
      };
    }

    const route = await this.getDriverRoute(driverId);
    return { dispatchId: id, ...route };
  }

  private async penalizeDriver(driverId: string): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}/penalize-cancellation`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ blockMinutes: 30 }),
        },
      );
    } catch (err: any) {
      this.logger.warn(`penalizeDriver failed for ${driverId}: ${err.message}`);
    }
  }

  private async notifyOrderDriverCancel(
    dispatch: Dispatch,
    reason: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}/driver-cancel`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ reason }),
        },
      );
    } catch (err: any) {
      this.logger.warn(`notifyOrderDriverCancel failed: ${err.message}`);
    }
  }

  private async notifyOrderDeliveryFailed(
    dispatch: Dispatch,
    reason: string,
    photoUrl?: string,
    faultParty?: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}/delivery-failed`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ reason, photoUrl, faultParty }),
        },
      );
    } catch (err: any) {
      this.logger.warn(`notifyOrderDeliveryFailed failed: ${err.message}`);
    }
  }

  // ---- Cron: Expire Stale Dispatches ----

  async expireStaleDispatches(): Promise<number> {
    const matchingDispatches = await this.dispatchRepo.findMatchingDispatches();
    const now = new Date();
    let expiredCount = 0;

    for (const dispatch of matchingDispatches) {
      const expiresAt = dispatch.dispatchExpiresAt;
      const createdAgo =
        now.getTime() - (dispatch.createdAt?.getTime() ?? now.getTime());
      // Fallback theo createdAt cho các dispatch cũ (chưa có expiresAt),
      // dùng timeout theo phương thức (PRIORITY 3', FAST 5', SAVER 10').
      const timeoutMs = dispatch.dispatchTimeoutSeconds * 1000;
      const isExpired =
        (expiresAt != null && expiresAt < now) || createdAgo > timeoutMs;

      if (isExpired && dispatch.isActive) {
        dispatch.expire();
        await this.dispatchRepo.save(dispatch);
        await this.notifyOrderNoDriver(dispatch);
        expiredCount++;
      }
    }

    return expiredCount;
  }

  // ---- Nearby (B3) ----
  /**
   * Các dispatch đang tìm tài xế quanh một toạ độ, đo tới **điểm lấy hàng
   * (quán)** — cùng điểm đo với điều kiện bán kính nhận đơn — và sắp xếp gần
   * nhất trước. `radiusKm` bỏ trống → dùng `DISPATCH_MAX_RADIUS_KM` (5km).
   */
  async getNearbyDispatches(
    lat: number,
    lng: number,
    radiusKm?: number,
  ): Promise<{ dispatch: Dispatch; distanceKm: number }[]> {
    const radius =
      Number.isFinite(radiusKm) && (radiusKm as number) > 0
        ? (radiusKm as number)
        : this.acceptRadiusKm();

    const matching = await this.dispatchRepo.findMatchingDispatches();
    const nearby: { dispatch: Dispatch; distanceKm: number }[] = [];

    for (const dispatch of matching) {
      const pickup = this.pickupCoordinates(dispatch);
      if (!pickup) continue;
      const distanceKm = this._haversineDistance(
        lat,
        lng,
        pickup.lat,
        pickup.lng,
      );
      if (distanceKm <= radius) nearby.push({ dispatch, distanceKm });
    }

    return nearby.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // ---- Location (B3) ----
  async getDispatchLocation(id: string): Promise<any> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );

    // Lấy GPS hiện tại của tài xế từ driver-service (server-to-server)
    let driverLatitude: number | null = null;
    let driverLongitude: number | null = null;
    const driverId = dispatch.dispatchDriverId;
    if (driverId) {
      try {
        const serviceKey =
          process.env.SERVICE_API_KEY || "mythfood-service-key";
        const res = await fetch(
          `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}`,
          { headers: { "x-service-key": serviceKey } },
        );
        if (res.ok) {
          const json: any = await res.json();
          const d = json?.data ?? json;
          const lat = Number(d?.currentLatitude ?? d?.latitude);
          const lng = Number(d?.currentLongitude ?? d?.longitude);
          if (!Number.isNaN(lat)) driverLatitude = lat;
          if (!Number.isNaN(lng)) driverLongitude = lng;
        }
      } catch {
        /* non-fatal */
      }
    }

    return {
      dispatchId: dispatch.id.value,
      status: dispatch.dispatchStatus,
      driverId,
      driverLatitude,
      driverLongitude,
      merchantLatitude: dispatch.dispatchMerchantLatitude,
      merchantLongitude: dispatch.dispatchMerchantLongitude,
      deliveryLatitude: dispatch.dispatchDeliveryLatitude,
      deliveryLongitude: dispatch.dispatchDeliveryLongitude,
    };
  }

  private _haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
