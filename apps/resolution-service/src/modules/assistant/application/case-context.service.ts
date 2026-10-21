import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CaseCategory } from "../../case/domain/case.enums";
import { CaseRepository } from "../../case/infrastructure/case.repository";
import { IntegrationService } from "../../integration/integration.service";
import {
  CASE_CONTEXT_SOURCES,
  CaseContextSnapshot,
  CaseDriverProfileInfo,
  CaseFlashSaleItemSnapshot,
  CaseGpsSignals,
  CaseImagePlan,
  CaseMenuItemSnapshot,
  CaseOrderItem,
  CasePromotionInfo,
  CasePromotionSnapshot,
  CaseReviewInfo,
  ContextSourceResult,
} from "../domain/assistant.types";
import { LlmInlineImage } from "../infrastructure/llm.types";
import { deriveGpsSignals } from "./gps-signals";
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
    const driverId: string | null =
      order?.driverId ??
      (c.caseRespondentType === "DRIVER"
        ? c.caseRespondentId
        : c.caseReporterType === "DRIVER"
          ? c.caseReporterId
          : null);
    const merchantId: string | null = order?.merchantId ?? null;
    const consumerId: string | null =
      c.caseReporterType === "CONSUMER"
        ? c.caseReporterId
        : c.caseRespondentType === "CONSUMER"
          ? c.caseRespondentId
          : null;
    const walletOwnerId: string | null =
      c.caseRespondentType === "CONSUMER" ||
      c.caseRespondentType === "DRIVER" ||
      c.caseRespondentType === "MERCHANT"
        ? c.caseRespondentId
        : null;
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
            () => this.integration.getConsumerByUserId(consumerId),
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
            () => this.integration.getWalletTransactions(walletOwnerId ?? ""),
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
    // Thứ tự gửi: ẢNH HỆ THỐNG → ảnh bên khiếu nại → ảnh bên bị khiếu nại →
    // ảnh chuẩn món (D15) → ảnh đánh giá. Bằng chứng của hai bên được ưu tiên
    // hơn ảnh tham chiếu để không làm mất suất ảnh quan trọng.
    const limit = Math.max(0, maxImages);
    const images: LlmInlineImage[] = [];
    const imagesSkipped: string[] = [];
    const imagePlan: CaseImagePlan = {
      deliveryProof: 0,
      menuReference: 0,
      reporter: 0,
      respondent: 0,
      review: 0,
    };
    const canTake = (): boolean => images.length < limit;

    const rawProofUrl =
      rawOrder?.deliveryProofPhotoUrl ?? (order as any)?.deliveryProofPhotoUrl;
    const deliveryProofPhotoUrl =
      typeof rawProofUrl === "string" && IMAGE_EXT.test(rawProofUrl)
        ? rawProofUrl
        : null;

    let deliveryProofImageAttached = false;
    if (deliveryProofPhotoUrl && canTake()) {
      const proofImage = await this.integration.downloadImage(
        deliveryProofPhotoUrl,
      );
      if (proofImage) {
        images.push({
          mimeType: proofImage.mimeType,
          base64: proofImage.base64,
          label: `ẢNH HỆ THỐNG — tài xế chụp món ăn lúc giao hàng: ${deliveryProofPhotoUrl}`,
          kind: "DELIVERY_PROOF",
        });
        deliveryProofImageAttached = true;
        imagePlan.deliveryProof = 1;
      } else {
        imagesSkipped.push(deliveryProofPhotoUrl);
      }
    }

    // Mỗi bên tối đa 2 ảnh (đủ để đối chiếu, không chiếm hết suất ảnh).
    const reporterUrls = (c.caseEvidence ?? [])
      .filter((u) => typeof u === "string" && IMAGE_EXT.test(u))
      .slice(0, Math.min(2, Math.max(0, limit - images.length)));
    const respondentUrls = (c.caseRespondentEvidence ?? [])
      .filter((u) => typeof u === "string" && IMAGE_EXT.test(u))
      .slice(
        0,
        Math.min(2, Math.max(0, limit - images.length - reporterUrls.length)),
      );

    // Thứ tự gửi: ảnh bên khiếu nại trước, rồi tới bên bị khiếu nại — prompt
    // cũng liệt kê đúng thứ tự này để model biết ảnh nào của ai.
    for (const [side, urls] of [
      ["BÊN KHIẾU NẠI", reporterUrls],
      ["BÊN BỊ KHIẾU NẠI", respondentUrls],
    ] as const) {
      let index = 0;
      for (const url of urls) {
        if (!canTake()) break;
        index += 1;
        const img = await this.integration.downloadImage(url);
        if (!img) {
          imagesSkipped.push(url);
          continue;
        }
        images.push({
          mimeType: img.mimeType,
          base64: img.base64,
          label: `${side} — ảnh ${index}: ${url}`,
          kind: side === "BÊN KHIẾU NẠI" ? "REPORTER" : "RESPONDENT",
        });
        if (side === "BÊN KHIẾU NẠI") imagePlan.reporter += 1;
        else imagePlan.respondent += 1;
      }
    }

    // Ảnh chuẩn món từ thực đơn — chỉ để đối chiếu hình dạng/bao bì/số hộp.
    const menuImageCap = envInt("AI_MAX_MENU_IMAGES", 2, 0, 8);
    const seenMenuImages = new Set<string>();
    for (const item of menuItems) {
      if (!canTake() || imagePlan.menuReference >= menuImageCap) break;
      const url = item.imageUrl;
      if (!url || !IMAGE_EXT.test(url) || seenMenuImages.has(url)) continue;
      seenMenuImages.add(url);
      const img = await this.integration.downloadImage(url);
      if (!img) {
        imagesSkipped.push(url);
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

    // Ảnh đánh giá của khách (tối đa 1) — bằng chứng phụ, không thay thế ảnh khiếu nại.
    const reviewForImages = Array.isArray(orderReview)
      ? orderReview[0]
      : orderReview;
    const reviewImageUrls = (
      Array.isArray(reviewForImages?.images) ? reviewForImages.images : []
    )
      .filter(
        (u: unknown): u is string => typeof u === "string" && IMAGE_EXT.test(u),
      )
      .slice(0, 1);
    for (const url of reviewImageUrls) {
      if (!canTake()) break;
      const img = await this.integration.downloadImage(url);
      if (!img) {
        imagesSkipped.push(url);
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
      imagesSkipped,
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
          "Không lấy được dữ liệu (service không phản hồi hoặc chưa có bản ghi)",
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
