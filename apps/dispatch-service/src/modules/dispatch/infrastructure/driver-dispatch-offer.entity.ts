import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

export type DriverDispatchOfferOutcome =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "NO_RESPONSE";

/**
 * Ghi nhận từng lượt tài xế được giao một đơn (offer) và kết quả phản hồi.
 *
 * Đây là nguồn dữ liệu để tính "tỉ lệ từ chối / không phản hồi trên 1 tháng".
 * Không dùng bảng này để tạo sự cố: chỉ khi tỉ lệ vượt ngưỡng thì
 * DriverComplianceService mới mở case khiếu nại.
 */
@Entity("driver_dispatch_offers")
@Unique("uq_driver_dispatch_offer", ["driver_id", "dispatch_id"])
export class DriverDispatchOfferEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid", name: "driver_id" })
  @Index("idx_driver_dispatch_offers_driver")
  driver_id!: string;

  @Column({ type: "uuid", name: "dispatch_id" })
  dispatch_id!: string;

  @Column({ type: "uuid", name: "order_id" })
  order_id!: string;

  /** PENDING | ACCEPTED | DECLINED | NO_RESPONSE */
  @Column({ type: "varchar", length: 20, default: "PENDING" })
  @Index("idx_driver_dispatch_offers_outcome")
  outcome!: DriverDispatchOfferOutcome;

  @Column({ type: "varchar", length: 30, name: "decline_reason", nullable: true })
  decline_reason!: string | null;

  @Column({
    type: "timestamptz",
    name: "offered_at",
    default: () => "NOW()",
  })
  @Index("idx_driver_dispatch_offers_offered_at")
  offered_at!: Date;

  @Column({ type: "timestamptz", name: "responded_at", nullable: true })
  responded_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updated_at!: Date;
}
