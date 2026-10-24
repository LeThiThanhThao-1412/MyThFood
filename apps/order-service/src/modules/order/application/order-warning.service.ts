import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { OrderWarningRepository } from "../infrastructure/order-warning.repository";
import { OrderWarningEntity } from "../infrastructure/order-warning.entity";

export type OrderWarningDto = {
  id: string;
  orderId: string;
  merchantId: string | null;
  type: string;
  severity: string;
  title: string;
  message: string;
  detail: Record<string, any> | null;
  dismissedAt: Date | null;
  dismissedBy: string | null;
  createdAt: Date;
};

/** Loại cảnh báo cho đơn giao thất bại do lỗi nhà hàng. */
export const MERCHANT_FAULT_WARNING = "MERCHANT_FAULT_DELIVERY_FAILED";

/**
 * Cảnh báo đơn hàng.
 *
 * Chính sách mới: nhà hàng gây lỗi giao thất bại KHÔNG bị phạt tiền nữa, chỉ
 * nhận một banner vàng trong chi tiết đơn (đọc rồi bấm "Đã hiểu" để tắt).
 * Tiền vẫn được route đủ: khách được hoàn, tài xế được bồi thường, nhà hàng
 * nhận doanh thu và trả nợ theo từng dòng riêng (wallet-service).
 */
@Injectable()
export class OrderWarningService {
  private readonly logger = new Logger(OrderWarningService.name);

  constructor(private readonly repo: OrderWarningRepository) {}

  private toDto(e: OrderWarningEntity): OrderWarningDto {
    return {
      id: e.id,
      orderId: e.orderId,
      merchantId: e.merchantId,
      type: e.type,
      severity: e.severity,
      title: e.title,
      message: e.message,
      detail: e.detail ?? null,
      dismissedAt: e.dismissedAt ?? null,
      dismissedBy: e.dismissedBy ?? null,
      createdAt: e.createdAt,
    };
  }

  /**
   * Ghi cảnh báo "đơn giao thất bại do lỗi nhà hàng" (idempotent theo
   * orderId + type). Không throw khi lỗi: đây là thông tin phụ trợ, không được
   * làm hỏng luồng phán quyết tiền.
   */
  async createMerchantFaultWarning(input: {
    orderId: string;
    merchantId: string | null;
    total: number;
    foodTotal: number;
    shippingFee: number;
    refundAmount: number;
    driverCompensation: number;
    severity?: string;
  }): Promise<OrderWarningDto | null> {
    const short = input.orderId.slice(0, 8);
    const money = (v: number) => Math.round(Number(v) || 0);
    try {
      const created = await this.repo.createIfAbsent({
        id: randomUUID(),
        orderId: input.orderId,
        merchantId: input.merchantId,
        type: MERCHANT_FAULT_WARNING,
        severity: "WARNING",
        title: "Đơn giao thất bại do lỗi nhà hàng",
        message:
          `Đơn #${short} không giao được vì lỗi từ nhà hàng. ` +
          `Khách đã được hoàn ${money(input.refundAmount).toLocaleString("vi-VN")}₫, ` +
          `tài xế được bồi thường ${money(input.driverCompensation).toLocaleString("vi-VN")}₫. ` +
          `Hai khoản này ghi thành nợ của nhà hàng và được thu hồi từ doanh thu. ` +
          `Doanh thu ${money(input.foodTotal).toLocaleString("vi-VN")}₫ của đơn vẫn được quyết toán bình thường. ` +
          `Vui lòng kiểm tra quy trình đóng gói/chuẩn bị món.`,
        detail: {
          total: money(input.total),
          foodTotal: money(input.foodTotal),
          shippingFee: money(input.shippingFee),
          refundAmount: money(input.refundAmount),
          driverCompensation: money(input.driverCompensation),
          fine: 0,
          severity: input.severity ?? null,
        },
      });
      return created ? this.toDto(created) : null;
    } catch (err: any) {
      this.logger.warn(
        `Không tạo được cảnh báo cho đơn ${short}: ${err?.message}`,
      );
      return null;
    }
  }

  async listByOrder(orderId: string): Promise<OrderWarningDto[]> {
    const rows = await this.repo.findByOrderId(orderId);
    return rows.map((e) => this.toDto(e));
  }

  async listActiveByMerchant(merchantId: string): Promise<OrderWarningDto[]> {
    const rows = await this.repo.findActiveByMerchant(merchantId);
    return rows.map((e) => this.toDto(e));
  }

  /** Ẩn cảnh báo vĩnh viễn cho người dùng hiện tại (idempotent). */
  async dismiss(
    orderId: string,
    warningId: string,
    dismissedBy: string,
  ): Promise<OrderWarningDto> {
    const found = await this.repo.findById(warningId);
    if (!found || found.orderId !== orderId) {
      throw new NotFoundException("Cảnh báo không tồn tại cho đơn này");
    }
    await this.repo.dismiss(warningId, dismissedBy);
    const fresh = await this.repo.findById(warningId);
    return this.toDto((fresh ?? found) as OrderWarningEntity);
  }
}
