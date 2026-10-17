import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export type OrderChangeRequestStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "APPLIED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type OrderChangeMoneyStatus =
  | "NONE"
  | "AWAITING_PAYMENT"
  | "CHARGED"
  | "REFUNDED"
  | "FAILED"
  | "NOT_REQUIRED";

/**
 * Đề xuất chỉnh sửa chi tiết đơn của nhà hàng.
 *
 * Mỗi yêu cầu lưu snapshot món/tổng tiền trước và sau để khách xem diff và
 * xác nhận. Chỉ khi khách xác nhận (và thanh toán phần chênh lệch nếu cần)
 * thì thay đổi mới được áp dụng vào bảng orders/order_items.
 */
@Entity("order_change_requests")
export class OrderChangeRequestEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column("uuid", { name: "order_id" })
  order_id!: string;

  @Column("uuid", { name: "merchant_id" })
  merchant_id!: string;

  @Column("uuid", { name: "consumer_id" })
  consumer_id!: string;

  @Index()
  @Column("varchar", { length: 30, default: "PENDING" })
  status!: OrderChangeRequestStatus;

  @Column("text", { nullable: true })
  reason!: string | null;

  @Column("text", { name: "reject_reason", nullable: true })
  reject_reason!: string | null;

  @Column("jsonb", { name: "before_items" })
  before_items!: Record<string, unknown>[];

  @Column("jsonb", { name: "after_items" })
  after_items!: Record<string, unknown>[];

  @Column("decimal", { precision: 12, scale: 2, name: "before_subtotal" })
  before_subtotal!: number;

  @Column("decimal", { precision: 12, scale: 2, name: "before_discount" })
  before_discount!: number;

  @Column("decimal", { precision: 12, scale: 2, name: "before_total" })
  before_total!: number;

  @Column("decimal", { precision: 12, scale: 2, name: "after_subtotal" })
  after_subtotal!: number;

  @Column("decimal", { precision: 12, scale: 2, name: "after_discount" })
  after_discount!: number;

  @Column("decimal", { precision: 12, scale: 2, name: "after_total" })
  after_total!: number;

  @Column("decimal", { precision: 12, scale: 2, name: "delta_amount" })
  delta_amount!: number;

  @Column("varchar", { length: 20, name: "payment_method" })
  payment_method!: string;

  @Column("varchar", { length: 20, name: "money_status", default: "NONE" })
  money_status!: OrderChangeMoneyStatus;

  @Column("uuid", { name: "adjustment_payment_id", nullable: true })
  adjustment_payment_id!: string | null;

  @Column("varchar", {
    length: 255,
    name: "adjustment_txn_id",
    nullable: true,
  })
  adjustment_txn_id!: string | null;

  @Column("int", { name: "before_items_version" })
  before_items_version!: number;

  @Column("uuid", { name: "created_by", nullable: true })
  created_by!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @Column("timestamptz", { name: "confirmed_at", nullable: true })
  confirmed_at!: Date | null;

  @Index()
  @Column("timestamptz", { name: "expires_at", nullable: true })
  expires_at!: Date | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updated_at!: Date;
}
