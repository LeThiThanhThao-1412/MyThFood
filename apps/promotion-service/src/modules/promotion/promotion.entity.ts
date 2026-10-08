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
// ============================================================================
// Flash Sale (do nhà hàng tạo, tự áp dụng theo món)
// ============================================================================

export const FLASH_SALE_STATUSES = [
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "CANCELLED",
  "SOLD_OUT",
] as const;
export type FlashSaleStatus = (typeof FLASH_SALE_STATUSES)[number];

export type FlashSaleDiscountType = "PERCENT" | "FIXED_PRICE";
export type FlashSaleFundedBy = "MERCHANT" | "PLATFORM";

@Entity("flash_sales")
export class FlashSaleEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  @Index()
  merchantId!: string;

  @Column({ type: "varchar", length: 255, default: "Flash Sale" })
  title!: string;

  @Column({ type: "varchar", length: 20, default: "MERCHANT" })
  fundedBy!: string; // MERCHANT | PLATFORM

  @Column({ type: "varchar", length: 20, default: "SCHEDULED" })
  status!: string; // SCHEDULED | ACTIVE | PAUSED | ENDED | CANCELLED | SOLD_OUT

  @Column({ type: "timestamptz" })
  startAt!: Date;

  @Column({ type: "timestamptz" })
  endAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

@Entity("flash_sale_items")
export class FlashSaleItemEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  @Index()
  flashSaleId!: string;

  @Column({ type: "uuid" })
  @Index()
  menuItemId!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  menuItemName!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  originalPrice!: number;

  @Column({ type: "varchar", length: 20 })
  discountType!: string; // PERCENT | FIXED_PRICE

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  discountPercent!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  salePrice!: number;

  @Column({ type: "int", default: 0 })
  totalQuantity!: number;

  @Column({ type: "int", default: 0 })
  soldQuantity!: number;

  @Column({ type: "int", default: 1 })
  limitPerUser!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

@Index(["orderId", "flashSaleItemId"], { unique: true })
@Entity("flash_sale_usages")
export class FlashSaleUsageEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  @Index()
  flashSaleId!: string;

  @Column({ type: "uuid" })
  @Index()
  flashSaleItemId!: string;

  @Column({ type: "uuid" })
  orderId!: string;

  @Column({ type: "uuid" })
  consumerId!: string;

  @Column({ type: "int" })
  quantity!: number;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  unitPrice!: number;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  discountAmount!: number;

  @Column({ type: "timestamptz", nullable: true })
  refundedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

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
