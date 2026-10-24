import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CaseCategory } from "../../case/domain/case.enums";
import { CaseRepository } from "../../case/infrastructure/case.repository";
import { IntegrationService } from "../../integration/integration.service";
import {
  CASE_CONTEXT_SOURCES,
  AiImageKind,
  CaseContextSnapshot,
  CaseDriverProfileInfo,
  CaseFlashSaleItemSnapshot,
  CaseGpsSignals,
  CaseImagePlan,
  CaseImageSkipReason,
  CaseMenuItemSnapshot,
  CaseOrderItem,
  CasePromotionInfo,
  CasePromotionSnapshot,
  CaseReviewInfo,
  ContextSourceResult,
} from "../domain/assistant.types";
import { LlmInlineImage } from "../infrastructure/llm.types";
import { deriveGpsSignals } from "./gps-signals";
import { buildImageOrder } from "./image-plan";
import {
  createPiiContext,
  PiiContext,
  piiReport,
  pseudonym,
  redactPayload,
  redactText,
} from "./pii/pii-redactor";
import { buildCaseTimeline } from "./timeline";

export interface BuiltCaseContext {
  snapshot: CaseContextSnapshot;
  images: LlmInlineImage[];
}

const SOURCE_BY_ID = new Map(CASE_CONTEXT_SOURCES.map((s) => [s.id, s]));
const nameOf = (id: string): string => SOURCE_BY_ID.get(id)?.name ?? id;

/** Danh mục gian lận — cần lịch sử hành vi của các bên. */
const FRAUD_CATEGORIES = new Set<CaseCategory>([
  CaseCategory.FAKE_DELIVERY,
  CaseCategory.COD_THEFT,
  CaseCategory.ORDER_FARMING,
  CaseCategory.FAKE_REVIEW,
  CaseCategory.PROMO_ABUSE,
  CaseCategory.REFUND_ABUSE,
  CaseCategory.MULTI_ACCOUNT,
  CaseCategory.CHARGEBACK_FRAUD,
  CaseCategory.GPS_SPOOFING,
  CaseCategory.COLLUSION,
]);

/** Danh mục cần soi tài xế (GPS + uy tín). */
const DRIVER_RELATED = new Set<CaseCategory>([
  CaseCategory.DRIVER_BEHAVIOR,
  CaseCategory.NOT_RECEIVED,
  CaseCategory.DELIVERY_LATE,
  CaseCategory.DAMAGED_ITEM,
  CaseCategory.UNAUTHORIZED_CANCEL,
  CaseCategory.FAKE_DELIVERY,
  CaseCategory.COD_THEFT,
  CaseCategory.GPS_SPOOFING,
  CaseCategory.COLLUSION,
]);

/**
 * Danh mục liên quan trực tiếp tới **món ăn** — cần hồ sơ tài xế + vết GPS để
 * hiểu ngữ cảnh giao hàng (tài xế mệt/đang gánh nhiều đơn, có tới điểm giao).
 */
const ITEM_RELATED = new Set<CaseCategory>([
  CaseCategory.ORDER_QUALITY,
  CaseCategory.MISSING_ITEM,
  CaseCategory.WRONG_ITEM,
  CaseCategory.DAMAGED_ITEM,
  CaseCategory.FOOD_SAFETY,
]);

/** Danh mục cần soi khách hàng. */
const CONSUMER_RELATED = new Set<CaseCategory>([
  CaseCategory.NOT_RECEIVED,
  CaseCategory.FAKE_DELIVERY,
  CaseCategory.FAKE_REVIEW,
  CaseCategory.ORDER_FARMING,
  CaseCategory.PROMO_ABUSE,
  CaseCategory.REFUND_ABUSE,
  CaseCategory.MULTI_ACCOUNT,
  CaseCategory.CHARGEBACK_FRAUD,
  CaseCategory.COLLUSION,
]);

/** Danh mục cần dữ liệu thanh toán. */
const PAYMENT_RELATED = new Set<CaseCategory>([
  CaseCategory.CHARGEBACK_FRAUD,
  CaseCategory.REFUND_ABUSE,
  CaseCategory.COD_THEFT,
]);

/** Danh mục cần dữ liệu ví. */
const WALLET_RELATED = new Set<CaseCategory>([
  CaseCategory.COD_THEFT,
  CaseCategory.REFUND_ABUSE,
]);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?.*)?$/i;

/** URL http(s) — bằng chứng hợp lệ để thử tải, kể cả khi không có đuôi ảnh. */
const REMOTE_URL = /^https?:\/\//i;

/**
 * Có phải URL có thể tải về làm ảnh?
 *
 * KHÔNG đòi hỏi đuôi `.jpg/.png`: ảnh upload từ điện thoại thường là
 * `.../complaints/1729-abc` (không đuôi), `.HEIC`, hoặc URL có query string lạ.
 * Trước đây lọc bằng `IMAGE_EXT` nên những ảnh này bị loại âm thầm ⇒ AI không
 * bao giờ nhận được ảnh của bên khiếu nại. Loại nội dung vẫn được kiểm tra
 * thật khi tải (`downloadImage` chỉ nhận `image/*`).
 */
const isImageCandidate = (value: unknown): value is string =>
  typeof value === "string" && REMOTE_URL.test(value.trim());

/** Ưu tiên URL trông giống ảnh để thử trước (không loại bỏ URL còn lại). */
const sortImageCandidates = (urls: string[]): string[] =>
  [...urls].sort(
    (a, b) => Number(IMAGE_EXT.test(b)) - Number(IMAGE_EXT.test(a)),
  );

/** Trần số URL thử tải cho mỗi nhóm ảnh (tránh treo khi bằng chứng toàn link hỏng). */
const MAX_IMAGE_ATTEMPTS = 8;

/**
 * Mã ẩn danh do tầng PII sinh ra (`KH-3F2A9C`, `TX-2D8256`, `NH-805152`, `ND-…`).
 *
 * Đây là giá trị **chỉ để hiển thị**: order-service/driver-service/merchant-service
 * nhận `id` kiểu UUID, nên gửi mã ẩn danh vào URL sẽ khiến Postgres báo
 * "invalid input syntax for type uuid" ⇒ service trả 500 (đúng lỗi từng thấy với
 * D4/D10/D11/D12/D15–D19: `…/drivers/TX-2D8256/location/history → 500`).
 */
const PSEUDONYM_ID = /^(?:KH|TX|NH|ND)-[0-9A-F]{6}$/i;

/**
 * Id dùng được để gọi service nội bộ.
 *
 * Trả `null` cho giá trị rỗng **và** cho mã ẩn danh — nhờ đó tầng này không bao
 * giờ gọi service bằng pseudonym dù dữ liệu đầu vào bị redact nhầm.
 */
const resolvableId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || PSEUDONYM_ID.test(trimmed)) return null;
  return trimmed;
};

/** Danh mục cần lịch sử đơn của tài xế dù không thuộc nhóm gian lận. */
const DRIVER_HISTORY_REQUIRED = new Set<CaseCategory>([
  CaseCategory.NOT_RECEIVED,
  CaseCategory.DELIVERY_LATE,
  CaseCategory.DAMAGED_ITEM,
  CaseCategory.UNAUTHORIZED_CANCEL,
  CaseCategory.DRIVER_BEHAVIOR,
  CaseCategory.GPS_SPOOFING,
]);

/**
 * Nguồn có thẻ riêng trong prompt (`<THUC_DON>`, `<UU_DAI>`…), nên KHÔNG dump
 * JSON thêm một lần nữa trong `<NGUON_DU_LIEU>` để tránh tăng token vô ích.
 */
export const STRUCTURED_SOURCE_IDS = new Set([
  "D15",
  "D16",
  "D17",
  "D18",
  "D19",
]);

const envBool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return !["false", "0", "off", "no"].includes(raw.trim().toLowerCase());
};

const envInt = (
  key: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isoOrNull = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(value as string | Date);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

/**
 * Thu thập ngữ cảnh dữ liệu cho một vụ việc từ nhiều service (D1–D14).
 *
 * Nguyên tắc:
 * - Best-effort: service lỗi/không có dữ liệu ⇒ ghi nhận "KHÔNG CÓ" để model
 *   biết là bằng chứng vắng mặt, thay vì bỏ qua âm thầm.
 * - Lấy theo 2 đợt: đợt 1 là dữ liệu của chính đơn hàng; đợt 2 là dữ liệu suy
 *   ra từ đợt 1 (driverId/merchantId/consumerId), lọc theo danh mục để không
 *   gọi thừa service.
 */
@Injectable()
export class CaseContextService {
  private readonly logger = new Logger(CaseContextService.name);

  constructor(
    private readonly repo: CaseRepository,
    private readonly integration: IntegrationService,
  ) {}

  async build(caseId: string, maxImages: number): Promise<BuiltCaseContext> {
    const c = await this.repo.findById(caseId);
    if (!c) throw new NotFoundException(`Case ${caseId} not found`);

    const orderId = c.caseOrderId;
    const category = c.caseCategory;
    const results = new Map<string, ContextSourceResult>();
    const pii = createPiiContext();
    const flags = this.readFlags();
    let rawOrder: any = null;
    const noOrderDetail = orderId
      ? undefined
      : "Vụ việc không gắn đơn hàng nên không có dữ liệu đơn";

    // ---- Đợt 1: dữ liệu thuộc chính đơn hàng (song song) ----
    const [order, orderTimeline, dispatch, chatMessages, orderReview] =
      await Promise.all([
        this.collect(
          results,
          "D1",
          () => this.integration.getOrder(orderId ?? ""),
          noOrderDetail,
          pii,
          undefined,
          (raw) => {
            rawOrder = raw;
          },
        ),
        this.collect(
          results,
          "D2",
          () => this.integration.getOrderTimeline(orderId ?? ""),
          noOrderDetail,
          pii,
        ),
        this.collect(
          results,
          "D3",
          () => this.integration.getDispatchByOrder(orderId ?? ""),
          noOrderDetail,
          pii,
        ),
        this.collect(
          results,
          "D7",
          () => this.integration.getChatMessagesByOrder(orderId ?? ""),
          noOrderDetail,
          pii,
          // Chat hay dài; giữ 30 tin MỚI NHẤT (đoạn bàn giao) thay vì 30 tin đầu.
          (value) => (Array.isArray(value) ? value.slice(-30) : value),
        ),
        this.collect(
          results,
          "D5",
          () => this.integration.getReviewsByOrder(orderId ?? ""),
          noOrderDetail,
          pii,
        ),
        PAYMENT_RELATED.has(category)
          ? this.collect(
              results,
              "D6",
              () => this.integration.getPaymentByOrder(orderId ?? ""),
              noOrderDetail,
              pii,
            )
          : Promise.resolve(null),
        this.collect(results, "D14", () =>
          this.previousCases(c.caseReporterId, c.caseRespondentId),
        ),
      ]);

    // ---- Suy ra danh tính các bên từ đợt 1 ----
    // QUAN TRỌNG: dùng `rawOrder` (payload gốc), KHÔNG dùng `order` — `order` đã
    // bị `redactPayload()` thay id bằng pseudonym (TX-/NH-/KH-). Gọi service khác
    // bằng pseudonym ⇒ Postgres lỗi cast UUID ⇒ mọi nguồn D4/D10/D11/D12/D15–D19
    // đều trả 500 (lỗi thực tế đã gặp). `resolvableId` chặn thêm lần nữa.
    const driverId: string | null =
      resolvableId(rawOrder?.driverId) ??
      (c.caseRespondentType === "DRIVER"
        ? resolvableId(c.caseRespondentId)
        : c.caseReporterType === "DRIVER"
          ? resolvableId(c.caseReporterId)
          : null);
    const merchantId: string | null = resolvableId(rawOrder?.merchantId);
    const consumerId: string | null =
      resolvableId(rawOrder?.consumerId) ??
      (c.caseReporterType === "CONSUMER"
        ? resolvableId(c.caseReporterId)
        : c.caseRespondentType === "CONSUMER"
          ? resolvableId(c.caseRespondentId)
          : null);
    /**
     * Ví cần soi: ưu tiên bên bị khiếu nại (người giữ tiền/COD), fallback bên
     * khiếu nại. `ownerType` phải đi kèm ownerId — wallet-service mặc định
     * DRIVER nên ví khách/nhà hàng sẽ không bao giờ được tìm thấy nếu thiếu.
     */
    const walletOwnerType: "CONSUMER" | "DRIVER" | "MERCHANT" | null =
      c.caseRespondentType === "CONSUMER" ||
      c.caseRespondentType === "DRIVER" ||
      c.caseRespondentType === "MERCHANT"
        ? (c.caseRespondentType as "CONSUMER" | "DRIVER" | "MERCHANT")
        : c.caseReporterType === "CONSUMER" ||
            c.caseReporterType === "DRIVER" ||
            c.caseReporterType === "MERCHANT"
          ? (c.caseReporterType as "CONSUMER" | "DRIVER" | "MERCHANT")
          : null;
    const walletOwnerId: string | null = resolvableId(
      walletOwnerType === c.caseRespondentType
        ? c.caseRespondentId
        : walletOwnerType === c.caseReporterType
          ? c.caseReporterId
          : null,
    );
    const noDriver = driverId
      ? undefined
      : "Không xác định được tài xế của đơn";
    const noMerchant = merchantId
      ? undefined
      : "Không xác định được nhà hàng của đơn";
    const noConsumer = consumerId
      ? undefined
      : "Không xác định được khách hàng của đơn";

    // ---- Đợt 2: dữ liệu suy ra / theo danh mục (song song) ----
    const gpsFrom =
      (dispatch as any)?.pickedUpAt ?? rawOrder?.createdAt ?? null;
    const gpsTo = (dispatch as any)?.deliveredAt ?? null;
    const reviewsCap = envInt("AI_CONTEXT_MAX_REVIEWS", 5, 1, 20);
    const menuCap = envInt("AI_CONTEXT_MAX_MENU_ITEMS", 10, 1, 50);
    const driverHistory =
      FRAUD_CATEGORIES.has(category) ||
      DRIVER_HISTORY_REQUIRED.has(category) ||
      ITEM_RELATED.has(category);

    const [, , , , , , , d15, d16, d17, d18, d19] = await Promise.all([
      driverId && (DRIVER_RELATED.has(category) || ITEM_RELATED.has(category))
        ? this.collect(
            results,
            "D4",
            () =>
              this.integration.getDriverLocationHistory(driverId, {
                orderId: orderId ?? undefined,
                from: gpsFrom,
                to: gpsTo,
                limit: 600,
              }),
            noDriver,
            pii,
            (raw) =>
              deriveGpsSignals(
                raw,
                {
                  latitude: rawOrder?.deliveryLatitude,
                  longitude: rawOrder?.deliveryLongitude,
                },
                { from: gpsFrom, to: gpsTo },
              ),
          )
        : Promise.resolve(null),
      driverId && (DRIVER_RELATED.has(category) || ITEM_RELATED.has(category))
        ? this.collect(
            results,
            "D11",
            () => this.integration.getDriverProfile(driverId),
            noDriver,
            pii,
            (value) =>
              value
                ? {
                    rating: value.rating ?? null,
                    totalRatings: value.totalRatings ?? null,
                  }
                : null,
          )
        : Promise.resolve(null),
      merchantId
        ? this.collect(
            results,
            "D12",
            () => this.integration.getMerchant(merchantId),
            noMerchant,
            pii,
            (value) => this.projectMerchant(value),
          )
        : Promise.resolve(null),
      consumerId && CONSUMER_RELATED.has(category)
        ? this.collect(
            results,
            "D13",
            () => this.integration.getConsumerProfile(consumerId),
            noConsumer,
            pii,
            (value) => this.projectConsumer(value),
          )
        : Promise.resolve(null),
      consumerId &&
      (FRAUD_CATEGORIES.has(category) || DRIVER_HISTORY_REQUIRED.has(category))
        ? this.collect(
            results,
            "D9",
            () => this.integration.getOrdersByConsumer(consumerId),
            noConsumer,
            pii,
          )
        : Promise.resolve(null),
      driverId && driverHistory
        ? this.collect(
            results,
            "D10",
            () => this.integration.getOrdersByDriver(driverId),
            noDriver,
            pii,
          )
        : Promise.resolve(null),
      WALLET_RELATED.has(category)
        ? this.collect(
            results,
            "D8",
            () =>
              this.integration.getWalletTransactions(
                walletOwnerId ?? "",
                walletOwnerType ?? "DRIVER",
              ),
            walletOwnerId
              ? undefined
              : "Không xác định được chủ ví cần kiểm tra",
            pii,
          )
        : Promise.resolve(null),
      // D15 — thực đơn của các món đã đặt.
      flags.menu && merchantId
        ? this.collect(
            results,
            "D15",
            () => this.integration.getMerchantMenu(merchantId),
            noMerchant,
            pii,
            (value) => (Array.isArray(value) ? value.slice(0, 300) : value),
          )
        : Promise.resolve(null),
      // D16 — mã giảm giá + flash sale + ưu đãi thực tế của đơn.
      flags.promo && (merchantId || orderId)
        ? this.collect(
            results,
            "D16",
            async () => {
              const [promotions, flashSales, orderUsage] = await Promise.all([
                this.integration.getMerchantPromotions(merchantId ?? ""),
                this.integration.getMerchantFlashSales(merchantId ?? ""),
                this.integration.getPromotionUsageByOrder(orderId ?? ""),
              ]);
              return { promotions, flashSales, orderUsage };
            },
            noMerchant,
            pii,
            (value) =>
              value &&
              ((value.promotions?.length ?? 0) > 0 ||
                (value.flashSales?.length ?? 0) > 0 ||
                value.orderUsage)
                ? value
                : null,
          )
        : Promise.resolve(null),
      // D17 — lịch sử đánh giá của nhà hàng.
      flags.merchantReviews && merchantId
        ? this.collect(
            results,
            "D17",
            () => this.integration.getMerchantReviews(merchantId, reviewsCap),
            noMerchant,
            pii,
            (value) => (value && (value.items?.length ?? 0) > 0 ? value : null),
          )
        : Promise.resolve(null),
      // D18 — lịch sử đánh giá dành cho tài xế.
      flags.driverReviews && driverId
        ? this.collect(
            results,
            "D18",
            () => this.integration.getDriverReviews(driverId, reviewsCap),
            noDriver,
            pii,
            (value) => (value && (value.items?.length ?? 0) > 0 ? value : null),
          )
        : Promise.resolve(null),
      // D19 — hồ sơ năng lực tài xế (không PII).
      flags.driverProfile && driverId
        ? this.collect(
            results,
            "D19",
            () => this.integration.getDriverAnalyticsProfile(driverId),
            noDriver,
            pii,
          )
        : Promise.resolve(null),
    ]);

    // ---- Dữ liệu có cấu trúc cho prompt (đã redact PII) ----
    const orderItems = this.buildOrderItems(order);
    const menuItems = this.buildMenuItems(orderItems, d15, menuCap);
    const promotions = this.buildPromotions(d16);
    const reviews = this.buildReviews(orderReview, d17, d18, reviewsCap);
    const driverProfile = this.buildDriverProfile(d19);
    const gpsSignals =
      (results.get("D4")?.payload as CaseGpsSignals | undefined) ?? null;
    const timeline = buildCaseTimeline({
      order: rawOrder ?? order,
      orderTimeline,
      dispatch,
      chatMessages,
      review: Array.isArray(orderReview) ? orderReview[0] : orderReview,
      caseCreatedAt: c.createdAt,
      caseRespondedAt: c.caseRespondentRespondedAt,
      gpsSignals,
    });

    // ---- Ảnh bằng chứng cho vision model ----
    // Thứ tự gửi ảnh phụ thuộc danh mục:
    // - Sự cố MÓN ĂN: ưu tiên ảnh chuẩn món (đối chiếu đúng/sai món).
    // - Còn lại: ưu tiên ảnh bằng chứng của hai bên.
    // Thứ tự này được lưu vào `snapshot.imageOrder` và dùng lại ở prompt +
    // `normalize()` để phân bổ đúng số ảnh provider báo đã đọc.
    const limit = Math.max(0, maxImages);
    const images: LlmInlineImage[] = [];
    const imagesSkipped: string[] = [];
    const imageSkipReasons: CaseImageSkipReason[] = [];
    const imagePlan: CaseImagePlan = {
      deliveryProof: 0,
      menuReference: 0,
      reporter: 0,
      respondent: 0,
      review: 0,
    };
    const canTake = (): boolean => images.length < limit;

    /**
     * Suất ảnh phải chừa cho ảnh bằng chứng của **hai bên** khi ảnh chuẩn món
     * đứng trước.
     *
     * Với sự cố món ăn, thứ tự là proof → món → hai bên. Nếu ảnh món lấy hết
     * suất thì ảnh khách gửi (bằng chứng mạnh nhất, trọng số 25%) **và** ảnh của
     * bên bị khiếu nại không bao giờ được gửi cho model ⇒ AI kết luận "không có
     * ảnh" dù cả hai bên đã gửi. Chừa 1 suất cho mỗi bên có ảnh.
     */
    const reserveSlots = (): number => {
      const menuIndex = imageOrder.indexOf("MENU_REFERENCE");
      if (menuIndex < 0) return 0;
      const reserveFor = (kind: "REPORTER" | "RESPONDENT", urls: string[]) =>
        imageOrder.indexOf(kind) > menuIndex && urls.length > 0 ? 1 : 0;
      return (
        reserveFor("REPORTER", reporterUrls) +
        reserveFor("RESPONDENT", respondentUrls)
      );
    };

    /**
     * Tải 1 URL đúng 1 lần cho cả lần dựng ngữ cảnh: cùng một ảnh có thể xuất
     * hiện ở nhiều nguồn (proof photo trùng evidence…) — không tải lại và không
     * báo "bỏ qua" hai lần.
     */
    const triedImageUrls = new Set<string>();
    const tryDownload = async (
      url: string,
    ): Promise<{ mimeType: string; base64: string; url: string } | null> => {
      if (triedImageUrls.has(url)) return null;
      triedImageUrls.add(url);
      const { image, reason } =
        await this.integration.downloadImageDetailed(url);
      if (!image) {
        imagesSkipped.push(url);
        imageSkipReasons.push({
          url,
          reason: reason || "không rõ nguyên nhân",
        });
      }
      return image;
    };

    const rawProofUrl =
      rawOrder?.deliveryProofPhotoUrl ?? (order as any)?.deliveryProofPhotoUrl;
    const deliveryProofPhotoUrl = isImageCandidate(rawProofUrl)
      ? rawProofUrl.trim()
      : null;

    let deliveryProofImageAttached = false;
    const attachProof = async (): Promise<void> => {
      if (deliveryProofImageAttached || !deliveryProofPhotoUrl || !canTake()) {
        return;
      }
      const proofImage = await tryDownload(deliveryProofPhotoUrl);
      if (!proofImage) {
        return;
      }
      images.push({
        mimeType: proofImage.mimeType,
        base64: proofImage.base64,
        label: `ẢNH HỆ THỐNG — tài xế chụp món ăn lúc giao hàng: ${deliveryProofPhotoUrl}`,
        kind: "DELIVERY_PROOF",
      });
      deliveryProofImageAttached = true;
      imagePlan.deliveryProof = 1;
    };

    // Bằng chứng hai bên: nhận mọi URL http(s). Ảnh upload từ app không phải
    // lúc nào cũng có đuôi `.jpg` (xem `isImageCandidate`).
    const reporterUrls = sortImageCandidates(
      (c.caseEvidence ?? []).filter(isImageCandidate),
    );
    const respondentUrls = sortImageCandidates(
      (c.caseRespondentEvidence ?? []).filter(isImageCandidate),
    );

    /** URL thực sự tải được, theo đúng thứ tự gửi model (dùng cho prompt). */
    const attachedSideUrls: Record<"REPORTER" | "RESPONDENT", string[]> = {
      REPORTER: [],
      RESPONDENT: [],
    };

    const attachSide = async (
      kind: "REPORTER" | "RESPONDENT",
      urls: string[],
    ): Promise<void> => {
      const sideLabel =
        kind === "REPORTER" ? "BÊN KHIẾU NẠI" : "BÊN BỊ KHIẾU NẠI";
      let attached = 0;
      let attempts = 0;
      for (const url of urls) {
        // Mỗi bên tối đa 2 ảnh (đủ để đối chiếu, không chiếm hết suất ảnh).
        // `attempts` chặn trường hợp bằng chứng toàn link hỏng (mỗi link tốn
        // tới 15s timeout) làm cả lần phân tích bị treo.
        if (!canTake() || attached >= 2 || attempts >= MAX_IMAGE_ATTEMPTS) {
          break;
        }
        attempts += 1;
        const img = await tryDownload(url);
        if (!img) {
          continue;
        }
        attached += 1;
        images.push({
          mimeType: img.mimeType,
          base64: img.base64,
          label: `${sideLabel} — ảnh ${attached}: ${url}`,
          kind,
        });
        attachedSideUrls[kind].push(url);
        if (kind === "REPORTER") imagePlan.reporter += 1;
        else imagePlan.respondent += 1;
      }
    };

    // Ảnh chuẩn món từ thực đơn — chỉ để đối chiếu hình dạng/bao bì/số hộp.
    const menuImageCap = envInt("AI_MAX_MENU_IMAGES", 2, 0, 8);
    const seenMenuImages = new Set<string>();
    const attachMenu = async (): Promise<void> => {
      // Tính suất ảnh món MỘT LẦN trước vòng lặp: nếu tính lại theo
      // `images.length` sau mỗi ảnh thì suất sẽ co dần và ảnh món thứ hai
      // không bao giờ được gửi.
      const menuCapacity = Math.min(
        menuImageCap,
        Math.max(0, limit - images.length - reserveSlots()),
      );
      for (const item of menuItems) {
        if (!canTake() || imagePlan.menuReference >= menuCapacity) break;
        const url = item.imageUrl;
        if (!isImageCandidate(url) || seenMenuImages.has(url)) continue;
        seenMenuImages.add(url);
        const img = await tryDownload(url);
        if (!img) {
          continue;
        }
        images.push({
          mimeType: img.mimeType,
          base64: img.base64,
          label: `ẢNH CHUẨN MÓN TỪ THỰC ĐƠN — ${item.name} — ${item.price ?? "?"}`,
          kind: "MENU_REFERENCE",
          refId: item.menuItemId,
        });
        imagePlan.menuReference += 1;
      }
    };

    // Ảnh đánh giá của khách (tối đa 1) — bằng chứng phụ, không thay thế ảnh khiếu nại.
    const reviewForImages = Array.isArray(orderReview)
      ? orderReview[0]
      : orderReview;
    const reviewImageUrls = (
      Array.isArray(reviewForImages?.images) ? reviewForImages.images : []
    )
      .filter(isImageCandidate)
      .slice(0, 1);
    const attachReview = async (): Promise<void> => {
      if (imagePlan.review > 0) return;
      for (const url of reviewImageUrls) {
        if (!canTake()) break;
        const img = await tryDownload(url);
        if (!img) {
          continue;
        }
        images.push({
          mimeType: img.mimeType,
          base64: img.base64,
          label: `ẢNH ĐÁNH GIÁ CỦA KHÁCH: ${url}`,
          kind: "REVIEW",
        });
        imagePlan.review += 1;
      }
    };

    const imageOrder: AiImageKind[] = buildImageOrder(
      ITEM_RELATED.has(category),
    );
    for (const kind of imageOrder) {
      if (!canTake()) break;
      switch (kind) {
        case "DELIVERY_PROOF":
          await attachProof();
          break;
        case "MENU_REFERENCE":
          await attachMenu();
          break;
        case "REPORTER":
          await attachSide("REPORTER", reporterUrls);
          break;
        case "RESPONDENT":
          await attachSide("RESPONDENT", respondentUrls);
          break;
        case "REVIEW":
          await attachReview();
          break;
      }
    }

    /**
     * Ảnh **có sẵn** (chưa tải) theo từng nhóm.
     *
     * Endpoint xem trước ngữ cảnh gọi `build(caseId, 0)` nên không tải ảnh —
     * nếu chỉ dựa vào `imagePlan` thì admin luôn thấy 0 và tưởng bên khiếu nại
     * không gửi ảnh. Trường này cho biết bằng chứng ảnh có tồn tại hay không.
     */
    const availableMenuImages = new Set(
      menuItems.map((item) => item.imageUrl).filter(isImageCandidate),
    ).size;
    const imagesAvailable: CaseImagePlan = {
      deliveryProof: deliveryProofPhotoUrl ? 1 : 0,
      menuReference: Math.min(menuImageCap, availableMenuImages),
      reporter: Math.min(2, reporterUrls.length),
      respondent: Math.min(2, respondentUrls.length),
      review: reviewImageUrls.length,
    };

    /**
     * Nguồn bị **bỏ qua** (thiếu tài xế/nhà hàng/khách, không áp dụng danh mục,
     * hoặc bị tắt bằng cờ rollout) vẫn phải xuất hiện trong danh sách nguồn.
     *
     * Trước đây các nguồn này không được ghi vào `results` nên biến mất khỏi
     * `snapshot.sources`: admin thấy "x/15 khả dụng" mà không biết nguồn nào không
     * được gọi và vì sao (rất dễ hiểu nhầm là service lỗi).
     */
    const disabledByFlag: Record<string, boolean> = {
      D15: !flags.menu,
      D16: !flags.promo,
      D17: !flags.merchantReviews,
      D18: !flags.driverReviews,
      D19: !flags.driverProfile,
    };
    const skippedSourceDetail: Record<string, string> = {};
    for (const id of ["D4", "D10", "D11", "D18", "D19"])
      skippedSourceDetail[id] = noDriver ?? "Không áp dụng cho danh mục này";
    for (const id of ["D12", "D15", "D16", "D17"])
      skippedSourceDetail[id] = noMerchant ?? "Không áp dụng cho danh mục này";
    for (const id of ["D9", "D13"])
      skippedSourceDetail[id] = noConsumer ?? "Không áp dụng cho danh mục này";
    for (const def of CASE_CONTEXT_SOURCES) {
      if (results.has(def.id)) continue;
      results.set(def.id, {
        id: def.id,
        name: def.name,
        available: false,
        detail: disabledByFlag[def.id]
          ? "Đã tắt bằng cờ cấu hình (rollout)"
          : (skippedSourceDetail[def.id] ??
            (def.id === "D6"
              ? "Danh mục này không cần dữ liệu thanh toán"
              : def.id === "D8"
                ? "Danh mục này không cần dữ liệu ví"
                : "Không áp dụng cho danh mục này")),
      });
    }

    const sources = CASE_CONTEXT_SOURCES.map((def) =>
      results.get(def.id),
    ).filter((s): s is ContextSourceResult => !!s);
    const missingSourceIds = sources
      .filter((s) => !s.available)
      .map((s) => s.id);
    const criticalMissingSourceIds = CASE_CONTEXT_SOURCES.filter(
      (def) =>
        def.criticalFor.includes(category) && missingSourceIds.includes(def.id),
    ).map((def) => def.id);

    // ---- PII: ẩn danh văn bản tự do + pseudonym ID người dùng ----
    const reporterId = this.maskActor(
      c.caseReporterType,
      c.caseReporterId,
      pii,
    );
    const respondentId = this.maskActor(
      c.caseRespondentType,
      c.caseRespondentId,
      pii,
    );
    const subject = redactText(c.caseSubject ?? "", pii);
    const description = redactText(c.caseDescription ?? "", pii);
    const respondentResponse = c.caseRespondentResponse
      ? redactText(c.caseRespondentResponse, pii)
      : null;

    // ---- Thống kê kích thước ngữ cảnh (đo token/latency) ----
    const perSourceChars: Record<string, number> = {};
    let totalChars = 0;
    for (const [id, source] of results.entries()) {
      const size = this.jsonSize(source.payload);
      perSourceChars[id] = size;
      totalChars += size;
    }
    totalChars += this.jsonSize({
      menuItems,
      promotions,
      reviews,
      driverProfile,
      timeline,
      gpsSignals,
    });

    const snapshot: CaseContextSnapshot = {
      generatedAt: new Date().toISOString(),
      case: {
        id: c.id.toString(),
        caseNumber: c.caseNumberValue,
        type: c.caseType,
        category: c.caseCategory,
        severity: c.caseSeverity,
        status: c.caseStatus,
        orderId,
        reporterId,
        reporterType: c.caseReporterType,
        respondentId,
        respondentType: c.caseRespondentType,
        subject,
        description,
        evidence: c.caseEvidence,
        respondentResponse,
        respondentEvidence: c.caseRespondentEvidence,
        respondentRespondedAt:
          c.caseRespondentRespondedAt?.toISOString() ?? null,
        createdAt: c.createdAt?.toISOString() ?? null,
        responseDeadline: c.caseResponseDeadline?.toISOString() ?? null,
      },
      sources,
      missingSourceIds,
      criticalMissingSourceIds,
      imagesAttached: images.length,
      /** Ảnh món ăn tài xế chụp lúc giao (bằng chứng hệ thống của đơn). */
      deliveryProofPhotoUrl,
      deliveryProofImageAttached,
      reporterImagesAttached: imagePlan.reporter,
      respondentImagesAttached: imagePlan.respondent,
      reporterImageUrls: attachedSideUrls.REPORTER,
      respondentImageUrls: attachedSideUrls.RESPONDENT,
      imagesSkipped,
      imageSkipReasons,
      imagesAvailable,
      orderItems,
      orderTotalAmount:
        typeof (rawOrder ?? order)?.totalAmount === "number"
          ? (rawOrder ?? order).totalAmount
          : null,
      menuItems,
      promotions,
      reviews,
      driverProfile,
      timeline,
      gpsSignals,
      pii: piiReport(pii),
      imagePlan,
      imageOrder,
      menuImagesAttached: imagePlan.menuReference,
      reviewImagesAttached: imagePlan.review,
      contextStats: {
        totalChars,
        estimatedTokens: Math.ceil(totalChars / 4),
        perSourceChars,
        gpsPoints: gpsSignals?.points ?? 0,
        imagesByKind: imagePlan,
      },
    };

    return { snapshot, images };
  }

  /** Cờ bật/tắt từng nguồn mới (rollout theo từng bước). */
  private readFlags() {
    return {
      menu: envBool("AI_CONTEXT_MENU", true),
      promo: envBool("AI_CONTEXT_PROMO", true),
      merchantReviews: envBool("AI_CONTEXT_MERCHANT_REVIEWS", true),
      driverReviews: envBool("AI_CONTEXT_DRIVER_REVIEWS", true),
      driverProfile: envBool("AI_CONTEXT_DRIVER_PROFILE", true),
    };
  }

  /** Pseudonym type-aware cho actor của vụ việc (KH-/TX-/NH-/ND-). */
  private maskActor(
    type: string | null | undefined,
    id: string | null | undefined,
    pii: PiiContext,
  ): string {
    const value = String(id ?? "");
    const prefix =
      type === "CONSUMER"
        ? "KH"
        : type === "DRIVER"
          ? "TX"
          : type === "MERCHANT"
            ? "NH"
            : "ND";
    pii.ids += 1;
    pii.kinds.add(`id:${prefix}`);
    return value ? pseudonym(prefix, value, pii) : "";
  }

  /** Chỉ giữ field nghiệp vụ của nhà hàng — bỏ ID/liên hệ/chủ sở hữu. */
  private projectMerchant(value: any): any {
    if (!value) return null;
    return {
      name: value.name,
      description: value.description ?? null,
      logoUrl: value.logoUrl ?? null,
      coverImageUrl: value.coverImageUrl ?? null,
      rating: value.rating ?? null,
      totalRatings: value.totalRatings ?? null,
      totalOrders: value.totalOrders ?? null,
      status: value.status ?? null,
      isOpen: value.isOpen ?? value.isOpenNow ?? null,
      capacityStatus: value.capacityStatus ?? null,
      currentOrderCount: value.currentOrderCount ?? null,
      primaryCategory: value.primaryCategory ?? null,
    };
  }

  /** Chỉ giữ trạng thái tài khoản — không tên/SĐT/địa chỉ/CCCD/payment methods. */
  private projectConsumer(value: any): any {
    if (!value) return null;
    return {
      status: value.status ?? null,
      isVerified: value.isVerified ?? value.is_verified ?? null,
      createdAt: value.createdAt ?? value.created_at ?? null,
    };
  }

  private jsonSize(value: unknown): number {
    if (value === undefined || value === null) return 0;
    try {
      return JSON.stringify(value)?.length ?? 0;
    } catch {
      return 0;
    }
  }

  private buildOrderItems(order: any): CaseOrderItem[] {
    const items = Array.isArray(order?.items) ? order.items : [];
    return items.slice(0, 20).map((item: any) => {
      const options = Array.isArray(item?.options)
        ? item.options
            .map(
              (option: any) =>
                option?.optionName ?? option?.name ?? option?.value ?? null,
            )
            .filter(Boolean)
            .join(", ")
        : null;
      return {
        menuItemId: item?.menuItemId ?? null,
        name: String(item?.name ?? "?"),
        quantity: Number(item?.quantity ?? 1),
        unitPrice: numOrNull(item?.unitPrice),
        options: options || null,
        imageUrl: item?.imageUrl ?? null,
        specialInstructions: item?.specialInstructions ?? null,
      };
    });
  }

  /** Ghép món đã đặt với thực đơn hiện tại (giá niêm yết/tồn kho/ảnh chuẩn). */
  private buildMenuItems(
    orderItems: CaseOrderItem[],
    menuPayload: any,
    cap: number,
  ): CaseMenuItemSnapshot[] {
    const menu: any[] = Array.isArray(menuPayload) ? menuPayload : [];
    const byId = new Map<string, any>(
      menu.filter((m) => m?.id).map((m) => [String(m.id), m]),
    );
    const result: CaseMenuItemSnapshot[] = [];
    const seen = new Set<string>();

    for (const item of orderItems) {
      const match =
        (item.menuItemId ? byId.get(String(item.menuItemId)) : null) ??
        menu.find(
          (m) =>
            String(m?.name ?? "").toLowerCase() === item.name.toLowerCase(),
        ) ??
        null;
      const key = String(match?.id ?? item.menuItemId ?? item.name);
      if (seen.has(key)) continue;
      seen.add(key);

      const menuPrice = numOrNull(match?.price);
      result.push({
        menuItemId: match?.id ?? item.menuItemId ?? null,
        name: match?.name ?? item.name,
        description: match?.description ?? null,
        price: menuPrice,
        originalPrice: numOrNull(match?.originalPrice),
        imageUrl: match?.imageUrl ?? item.imageUrl ?? null,
        isAvailable:
          typeof match?.isAvailable === "boolean" ? match.isAvailable : null,
        availabilityStatus: match?.availabilityStatus ?? null,
        outOfStockUntil: isoOrNull(match?.outOfStockUntil),
        preparationTime: numOrNull(match?.preparationTime),
        isFeatured:
          typeof match?.isFeatured === "boolean" ? match.isFeatured : null,
        optionGroups: this.flattenOptionGroups(match?.optionGroups),
        orderedQuantity: item.quantity,
        orderUnitPrice: item.unitPrice ?? null,
        priceMismatch:
          menuPrice !== null && item.unitPrice != null
            ? Math.abs(menuPrice - Number(item.unitPrice)) > 1
            : null,
      });
      if (result.length >= cap) break;
    }
    return result;
  }

  private flattenOptionGroups(groups: unknown): string[] {
    if (!Array.isArray(groups)) return [];
    return groups
      .slice(0, 5)
      .map((group: any) => {
        const options = Array.isArray(group?.options)
          ? group.options
              .slice(0, 8)
              .map((option: any) => {
                const delta = Number(option?.priceDelta ?? 0);
                const suffix =
                  Number.isFinite(delta) && delta !== 0
                    ? ` (${delta > 0 ? "+" : ""}${delta})`
                    : "";
                return `${option?.name ?? "?"}${suffix}`;
              })
              .join(", ")
          : "";
        return `${group?.name ?? "?"}${group?.required ? " (bắt buộc)" : ""}: ${options}`;
      })
      .filter((line) => !line.endsWith(": "));
  }

  /** Ưu đãi thực tế của đơn + ưu đãi đang cấu hình của quán (D16). */
  private buildPromotions(payload: any): CasePromotionInfo | null {
    if (!payload || typeof payload !== "object") return null;
    const promotions: any[] = Array.isArray(payload.promotions)
      ? payload.promotions
      : [];
    const flashSales: any[] = Array.isArray(payload.flashSales)
      ? payload.flashSales
      : [];
    const usage = payload.orderUsage ?? null;
    const flashUsages: any[] = Array.isArray(usage?.flashSaleUsages)
      ? usage.flashSaleUsages
      : [];

    const orderUsage =
      usage?.promotionUsage || flashUsages.length
        ? {
            code: usage?.promotion?.code ?? null,
            discountAmount: numOrNull(usage?.promotionUsage?.discountAmount),
            fundedBy: usage?.promotion?.fundedBy ?? null,
            flashSaleDiscount:
              flashUsages.reduce(
                (sum, item) => sum + (Number(item?.discountAmount) || 0),
                0,
              ) || null,
          }
        : null;

    const merchantPromotions: CasePromotionSnapshot[] = promotions
      .slice(0, 10)
      .map((promotion: any) => ({
        code: String(promotion?.code ?? "?"),
        type: String(promotion?.type ?? "?"),
        target: String(promotion?.target ?? "?"),
        fundedBy: String(promotion?.fundedBy ?? "?"),
        value: numOrNull(promotion?.value),
        minOrderValue: numOrNull(promotion?.minOrderValue),
        maxDiscount: numOrNull(promotion?.maxDiscount),
        menuItemName: promotion?.menuItemName ?? null,
        isActive: promotion?.isActive === true,
        startAt: isoOrNull(promotion?.startAt),
        endAt: isoOrNull(promotion?.endAt),
        usageLimit: numOrNull(promotion?.usageLimit),
        usageLimitPerUser: numOrNull(promotion?.usageLimitPerUser),
        usedCount: numOrNull(promotion?.usedCount),
      }))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive));

    const flashSaleItems: CaseFlashSaleItemSnapshot[] = [];
    const seenItems = new Set<string>();
    for (const sale of flashSales) {
      const items: any[] = Array.isArray(sale?.items) ? sale.items : [];
      for (const item of items) {
        const menuItemId = String(item?.menuItemId ?? "");
        if (!menuItemId || seenItems.has(menuItemId)) continue;
        seenItems.add(menuItemId);
        flashSaleItems.push({
          menuItemId,
          menuItemName: item?.menuItemName ?? null,
          originalPrice: numOrNull(item?.originalPrice),
          salePrice: numOrNull(item?.salePrice),
          discountPercent: numOrNull(item?.discountPercent),
          totalQuantity: numOrNull(item?.totalQuantity),
          soldQuantity: numOrNull(item?.soldQuantity),
          limitPerUser: numOrNull(item?.limitPerUser),
          status: sale?.status ?? null,
          startAt: isoOrNull(sale?.startAt),
          endAt: isoOrNull(sale?.endAt),
        });
        if (flashSaleItems.length >= 10) break;
      }
      if (flashSaleItems.length >= 10) break;
    }

    return {
      orderUsage,
      merchantPromotions,
      flashSaleItems,
      configured: promotions.length + flashSaleItems.length,
      usedInOrder: (usage?.promotionUsage ? 1 : 0) + flashUsages.length,
    };
  }

  /** Đánh giá của đơn + lịch sử gần đây của quán/tài xế (D17/D18). */
  private buildReviews(
    orderReview: any,
    merchantPayload: any,
    driverPayload: any,
    cap: number,
  ): CaseReviewInfo | null {
    const review = Array.isArray(orderReview)
      ? (orderReview[0] ?? null)
      : (orderReview ?? null);

    const order =
      review && typeof review === "object" && review.rating != null
        ? {
            rating: numOrNull(review.rating),
            comment: review.comment ?? null,
            tags: Array.isArray(review.tags) ? review.tags.slice(0, 10) : [],
            imageCount: Array.isArray(review.images) ? review.images.length : 0,
            merchantReply: review.merchantReply ?? null,
            driverRating: numOrNull(review.driverRating),
            driverComment: review.driverComment ?? null,
            createdAt: isoOrNull(review.createdAt),
          }
        : null;

    const merchant =
      merchantPayload && typeof merchantPayload === "object"
        ? {
            averageRating: numOrNull(merchantPayload.averageRating),
            total: numOrNull(merchantPayload.total),
            recent: (Array.isArray(merchantPayload.items)
              ? merchantPayload.items
              : []
            )
              .slice(0, cap)
              .map((item: any) => ({
                rating: numOrNull(item?.rating),
                comment: item?.comment ?? null,
                tags: Array.isArray(item?.tags) ? item.tags.slice(0, 10) : [],
                hasMerchantReply: !!item?.merchantReply,
                createdAt: isoOrNull(item?.createdAt),
              })),
          }
        : null;

    const driver =
      driverPayload && typeof driverPayload === "object"
        ? {
            averageRating: numOrNull(driverPayload.averageRating),
            total: numOrNull(driverPayload.total),
            distribution:
              driverPayload.distribution &&
              typeof driverPayload.distribution === "object"
                ? driverPayload.distribution
                : null,
            recent: (Array.isArray(driverPayload.items)
              ? driverPayload.items
              : []
            )
              .slice(0, cap)
              .map((item: any) => ({
                rating: numOrNull(item?.driverRating),
                comment: item?.driverComment ?? null,
                createdAt: isoOrNull(item?.createdAt),
              })),
          }
        : null;

    if (!order && !merchant && !driver) return null;
    return { order, merchant, driver };
  }

  /** Hồ sơ năng lực tài xế (D19) — endpoint đã whitelist, không có PII. */
  private buildDriverProfile(payload: any): CaseDriverProfileInfo | null {
    if (!payload || typeof payload !== "object") return null;
    return {
      rating: numOrNull(payload.rating),
      totalRatings: numOrNull(payload.totalRatings),
      totalOrders: numOrNull(payload.totalOrders),
      reputationScore: numOrNull(payload.reputationScore),
      status: payload.status ?? null,
      onlineStatus: payload.onlineStatus ?? null,
      vehicleType: payload.vehicleType ?? null,
      fatigueLevel: payload.fatigueLevel ?? null,
      consecutiveDrivingMinutes: numOrNull(payload.consecutiveDrivingMinutes),
      totalDrivingMinutesToday: numOrNull(payload.totalDrivingMinutesToday),
      isTrainingCompleted:
        typeof payload.isTrainingCompleted === "boolean"
          ? payload.isTrainingCompleted
          : null,
      acceptBlockedUntil: isoOrNull(payload.acceptBlockedUntil),
      activeOrderCount: numOrNull(payload.activeOrderCount),
      maxConcurrentOrders: numOrNull(payload.maxConcurrentOrders),
      createdAt: isoOrNull(payload.createdAt),
    };
  }

  /**
   * Vụ việc trước đây có liên quan tới 2 bên (nguồn D14) — dùng để nhận diện
   * người khiếu nại/tố cáo lặp lại.
   */
  private async previousCases(reporterId: string, respondentId: string) {
    const [asReporter, asRespondent] = await Promise.all([
      this.repo.findAndCount({ actorId: reporterId, skip: 0, take: 10 }),
      this.repo.findAndCount({ actorId: respondentId, skip: 0, take: 10 }),
    ]);
    const summarize = (items: any[]) =>
      items.map((x) => ({
        caseNumber: x.caseNumber,
        category: x.category,
        severity: x.severity,
        status: x.status,
        verdict: x.verdict,
        createdAt: x.createdAt,
      }));
    return {
      totalForReporter: asReporter.total,
      totalForRespondent: asRespondent.total,
      recentForReporter: summarize(asReporter.items),
      recentForRespondent: summarize(asRespondent.items),
    };
  }

  /**
   * Chạy 1 loader, ghi kết quả vào map, trả payload **đã ẩn danh** nếu khả dụng.
   *
   * `transform` chạy trước khi redact (rút gọn payload thô thành tín hiệu),
   * `onRaw` nhận payload gốc khi cần tính toán nội bộ (vd toạ độ điểm giao).
   */
  private async collect(
    results: Map<string, ContextSourceResult>,
    id: string,
    loader: () => Promise<unknown>,
    unavailableDetail?: string,
    pii?: PiiContext,
    transform?: (value: any) => any,
    onRaw?: (value: any) => void,
  ): Promise<any> {
    if (unavailableDetail) {
      results.set(id, {
        id,
        name: nameOf(id),
        available: false,
        detail: unavailableDetail,
      });
      return null;
    }
    try {
      const raw = await loader();
      if (onRaw) onRaw(raw);
      const transformed = transform ? transform(raw) : raw;
      const value = pii ? redactPayload(transformed, pii) : transformed;
      const desc = this.describe(value);
      results.set(id, {
        id,
        name: nameOf(id),
        available: desc.available,
        detail: desc.detail,
        payload: desc.available ? value : undefined,
      });
      return desc.available ? value : null;
    } catch (err: any) {
      this.logger.warn(`Thu thập nguồn ${id} thất bại: ${err?.message}`);
      results.set(id, {
        id,
        name: nameOf(id),
        available: false,
        detail: `Lỗi thu thập: ${err?.message ?? "unknown"}`,
      });
      return null;
    }
  }

  /** Quy ước "có dữ liệu": object khác null, mảng không rỗng, primitive khác null. */
  private describe(value: unknown): { available: boolean; detail?: string } {
    if (value === null || value === undefined) {
      return {
        available: false,
        detail:
          "Service trả về rỗng (HTTP 200 nhưng không có bản ghi cho id này)",
      };
    }
    if (Array.isArray(value)) {
      return value.length > 0
        ? { available: true }
        : { available: false, detail: "Không có bản ghi nào" };
    }
    if (
      typeof value === "object" &&
      Object.keys(value as object).length === 0
    ) {
      return { available: false, detail: "Bản ghi rỗng" };
    }
    return { available: true };
  }
}
