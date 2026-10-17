import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CaseCategory } from "../../case/domain/case.enums";
import { CaseRepository } from "../../case/infrastructure/case.repository";
import { IntegrationService } from "../../integration/integration.service";
import {
  CASE_CONTEXT_SOURCES,
  CaseContextSnapshot,
  ContextSourceResult,
} from "../domain/assistant.types";
import { LlmInlineImage } from "../infrastructure/llm.types";

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

/** Danh mục cần soi nhà hàng. */
const MERCHANT_RELATED = new Set<CaseCategory>([
  CaseCategory.ORDER_QUALITY,
  CaseCategory.MISSING_ITEM,
  CaseCategory.WRONG_ITEM,
  CaseCategory.DAMAGED_ITEM,
  CaseCategory.FOOD_SAFETY,
  CaseCategory.MERCHANT_BEHAVIOR,
  CaseCategory.UNAUTHORIZED_CANCEL,
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
    const noOrderDetail = orderId
      ? undefined
      : "Vụ việc không gắn đơn hàng nên không có dữ liệu đơn";

    // ---- Đợt 1: dữ liệu thuộc chính đơn hàng ----
    const order = await this.collect(
      results,
      "D1",
      () => this.integration.getOrder(orderId ?? ""),
      noOrderDetail,
    );
    await this.collect(
      results,
      "D2",
      () => this.integration.getOrderTimeline(orderId ?? ""),
      noOrderDetail,
    );
    await this.collect(
      results,
      "D3",
      () => this.integration.getDispatchByOrder(orderId ?? ""),
      noOrderDetail,
    );
    await this.collect(
      results,
      "D7",
      () => this.integration.getChatMessagesByOrder(orderId ?? ""),
      noOrderDetail,
    );
    await this.collect(
      results,
      "D5",
      () => this.integration.getReviewsByOrder(orderId ?? ""),
      noOrderDetail,
    );
    if (PAYMENT_RELATED.has(category)) {
      await this.collect(
        results,
        "D6",
        () => this.integration.getPaymentByOrder(orderId ?? ""),
        noOrderDetail,
      );
    }
    await this.collect(results, "D14", () =>
      this.previousCases(c.caseReporterId, c.caseRespondentId),
    );

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

    // ---- Đợt 2: dữ liệu suy ra / theo danh mục ----
    if (DRIVER_RELATED.has(category)) {
      await this.collect(
        results,
        "D4",
        () => this.integration.getDriverLocationHistory(driverId ?? ""),
        noDriver,
      );
      await this.collect(
        results,
        "D11",
        () => this.integration.getDriverProfile(driverId ?? ""),
        noDriver,
      );
    }
    if (MERCHANT_RELATED.has(category)) {
      await this.collect(
        results,
        "D12",
        () => this.integration.getMerchant(merchantId ?? ""),
        noMerchant,
      );
    }
    if (CONSUMER_RELATED.has(category)) {
      await this.collect(
        results,
        "D13",
        () => this.integration.getConsumerByUserId(consumerId ?? ""),
        noConsumer,
      );
    }
    if (FRAUD_CATEGORIES.has(category)) {
      await this.collect(
        results,
        "D9",
        () => this.integration.getOrdersByConsumer(consumerId ?? ""),
        noConsumer,
      );
      await this.collect(
        results,
        "D10",
        () => this.integration.getOrdersByDriver(driverId ?? ""),
        noDriver,
      );
    }
    if (WALLET_RELATED.has(category)) {
      await this.collect(
        results,
        "D8",
        () => this.integration.getWalletTransactions(walletOwnerId ?? ""),
        walletOwnerId ? undefined : "Không xác định được chủ ví cần kiểm tra",
      );
    }

    // ---- Ảnh bằng chứng cho vision model ----
    // Thứ tự gửi: ẢNH HỆ THỐNG (tài xế chụp món ăn lúc giao) → ảnh bên khiếu
    // nại → ảnh bên bị khiếu nại. Ảnh hệ thống là bằng chứng khách quan nên
    // KHÔNG tính vào phần phân tích ảnh của hai bên.
    const limit = Math.max(0, maxImages);
    const images: LlmInlineImage[] = [];
    const imagesSkipped: string[] = [];
    let reporterImagesAttached = 0;
    let respondentImagesAttached = 0;

    const rawProofUrl = (order as any)?.deliveryProofPhotoUrl;
    const deliveryProofPhotoUrl =
      typeof rawProofUrl === "string" && IMAGE_EXT.test(rawProofUrl)
        ? rawProofUrl
        : null;

    let deliveryProofImageAttached = false;
    if (deliveryProofPhotoUrl && limit > 0) {
      const proofImage = await this.integration.downloadImage(
        deliveryProofPhotoUrl,
      );
      if (proofImage) {
        images.push({
          mimeType: proofImage.mimeType,
          base64: proofImage.base64,
          label: `ẢNH HỆ THỐNG — tài xế chụp món ăn lúc giao hàng: ${deliveryProofPhotoUrl}`,
        });
        deliveryProofImageAttached = true;
      } else {
        imagesSkipped.push(deliveryProofPhotoUrl);
      }
    }

    // Ảnh hệ thống (nếu gửi được) chiếm 1 suất trong giới hạn ảnh.
    const sideImageBudget = Math.max(
      0,
      limit - (deliveryProofImageAttached ? 1 : 0),
    );
    const reporterUrls = (c.caseEvidence ?? [])
      .filter((u) => typeof u === "string" && IMAGE_EXT.test(u))
      .slice(0, sideImageBudget);
    const respondentUrls = (c.caseRespondentEvidence ?? [])
      .filter((u) => typeof u === "string" && IMAGE_EXT.test(u))
      .slice(0, Math.max(0, sideImageBudget - reporterUrls.length));

    // Thứ tự gửi: ảnh bên khiếu nại trước, rồi tới bên bị khiếu nại — prompt
    // cũng liệt kê đúng thứ tự này để model biết ảnh nào của ai.
    for (const [side, urls] of [
      ["BÊN KHIẾU NẠI", reporterUrls],
      ["BÊN BỊ KHIẾU NẠI", respondentUrls],
    ] as const) {
      let index = 0;
      for (const url of urls) {
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
        });
        if (side === "BÊN KHIẾU NẠI") reporterImagesAttached += 1;
        else respondentImagesAttached += 1;
      }
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
        reporterId: c.caseReporterId,
        reporterType: c.caseReporterType,
        respondentId: c.caseRespondentId,
        respondentType: c.caseRespondentType,
        subject: c.caseSubject,
        description: c.caseDescription,
        evidence: c.caseEvidence,
        respondentResponse: c.caseRespondentResponse,
        respondentEvidence: c.caseRespondentEvidence,
        respondentRespondedAt:
          c.caseRespondentRespondedAt?.toISOString() ?? null,
        createdAt: null,
        responseDeadline: c.caseResponseDeadline?.toISOString() ?? null,
      },
      sources,
      missingSourceIds,
      criticalMissingSourceIds,
      imagesAttached: images.length,
      /** Ảnh món ăn tài xế chụp lúc giao (bằng chứng hệ thống của đơn). */
      deliveryProofPhotoUrl,
      deliveryProofImageAttached,
      reporterImagesAttached,
      respondentImagesAttached,
      imagesSkipped,
    };

    return { snapshot, images };
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

  /** Chạy 1 loader, ghi kết quả vào map, trả payload nếu khả dụng. */
  private async collect(
    results: Map<string, ContextSourceResult>,
    id: string,
    loader: () => Promise<unknown>,
    unavailableDetail?: string,
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
      const value = await loader();
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
