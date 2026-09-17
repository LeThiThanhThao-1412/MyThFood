import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("promotions")
export class PromotionEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  merchantId!: string;

  @Column({ type: "varchar", length: 50, unique: true })
  code!: string;

  @Column({ type: "varchar", length: 20 })
  type!: string; // PERCENT | FIXED

  @Column({ type: "varchar", length: 20, default: "FOOD" })
  target!: string; // FOOD | SHIPPING

  @Column({ type: "varchar", length: 20, default: "MERCHANT" })
  fundedBy!: string; // MERCHANT | PLATFORM

  // Món cụ thể được áp dụng (chỉ dùng khi target = ITEM)
  @Column({ type: "uuid", nullable: true })
  menuItemId!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  menuItemName!: string | null;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  value!: number;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  minOrderValue!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  maxDiscount!: number | null;

  @Column({ type: "timestamptz", nullable: true })
  startAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  endAt!: Date | null;

  @Column({ type: "int", nullable: true })
  usageLimit!: number | null;

  @Column({ type: "int", nullable: true })
  usageLimitPerUser!: number | null;

  @Column({ type: "int", default: 0 })
  usedCount!: number;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

@Index(["orderId"], { unique: true })
@Entity("promotion_usages")
export class PromotionUsageEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  promotionId!: string;

  @Column({ type: "uuid" })
  orderId!: string;

  @Column({ type: "uuid" })
  consumerId!: string;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  discountAmount!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

/** Fixed id of the single-row compensation voucher configuration. */
export const COMPENSATION_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Cấu hình voucher bồi thường (đơn bị hủy do không có tài xế).
 * Singleton — admin có thể thay đổi giá trị / bật tắt.
 */
@Entity("compensation_config")
export class CompensationConfigEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 15000 })
  value!: number;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

/**
 * Voucher bồi thường đã phát cho khách hàng (dùng 1 lần cho đơn tiếp theo).
 */
@Index(["sourceOrderId"], { unique: true })
@Entity("compensation_vouchers")
export class CompensationVoucherEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "uuid" })
  @Index()
  consumerId!: string;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  value!: number;

  @Column({ type: "uuid" })
  sourceOrderId!: string;

  @Column({ type: "boolean", default: false })
  isUsed!: boolean;

  @Column({ type: "uuid", nullable: true })
  usedOrderId!: string | null;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  issuedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
