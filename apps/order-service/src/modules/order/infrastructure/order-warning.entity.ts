import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Cảnh báo gắn với một đơn hàng — thay cho "tiền phạt" cứng trước đây.
 *
 * Nhà hàng thấy banner vàng trong chi tiết đơn; bấm "Đã hiểu" ⇒ lưu
 * `dismissedAt`/`dismissedBy` để không hiện lại (idempotent theo unique index
 * `orderId` + `type`).
 */
@Entity("order_warnings")
@Index("UQ_order_warnings_order_type", ["orderId", "type"], { unique: true })
@Index("IDX_order_warnings_merchant", { synchronize: false })
@Index("IDX_order_warnings_active", { synchronize: false })
export class OrderWarningEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column("varchar", { length: 100, name: "orderId" })
  orderId!: string;

  @Column("varchar", { length: 100, name: "merchantId", nullable: true })
  merchantId!: string | null;

  /** MERCHANT_FAULT_DELIVERY_FAILED | ... (mỗi đơn tối đa 1 cảnh báo/loại). */
  @Column("varchar", { length: 40 })
  type!: string;

  /** WARNING | CRITICAL — dùng cho màu/độ ưu tiên hiển thị. */
  @Column("varchar", { length: 20, default: "WARNING" })
  severity!: string;

  @Column("varchar", { length: 255 })
  title!: string;

  @Column("text")
  message!: string;

  /** Số tiền/số dòng nợ liên quan để UI hiển thị chi tiết. */
  @Column("jsonb", { nullable: true })
  detail!: Record<string, any> | null;

  @Column("timestamptz", { name: "dismissedAt", nullable: true })
  dismissedAt!: Date | null;

  @Column("varchar", { length: 100, name: "dismissedBy", nullable: true })
  dismissedBy!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "createdAt" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updatedAt" })
  updatedAt!: Date;
}
