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
