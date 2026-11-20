import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * Nhật ký biến động giá trị đơn — mỗi yêu cầu chỉnh sửa được áp dụng sinh
 * đúng 1 bản ghi. Dùng cho audit, đối soát doanh thu và in lại hóa đơn
 * gốc/điều chỉnh.
 */
@Entity("order_adjustments")
export class OrderAdjustmentEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column("uuid", { name: "order_id" })
  order_id!: string;

  @Index()
  @Column("uuid", { name: "change_request_id", unique: true })
  change_request_id!: string;

  @Index()
  @Column("uuid", { name: "merchant_id" })
  merchant_id!: string;

  @Column("uuid", { name: "consumer_id" })
  consumer_id!: string;

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

  @Column("varchar", { length: 20, name: "money_status" })
  money_status!: string;

  @Column("varchar", {
    length: 20,
    name: "settlement_status",
    default: "PENDING_ACCRUAL",
  })
  settlement_status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;
}
