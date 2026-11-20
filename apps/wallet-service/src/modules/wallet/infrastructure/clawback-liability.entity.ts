import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("clawback_liabilities")
export class ClawbackLiabilityEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 100 })
  ownerId!: string;

  @Index()
  @Column({ type: "varchar", length: 20 })
  ownerType!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  sourceOrderId!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  sourceBatchId!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  refundId!: string | null;

  @Column("decimal", { precision: 14, scale: 2 })
  originalAmount!: number;

  @Column("decimal", { precision: 14, scale: 2 })
  remainingAmount!: number;

  /**
   * Nhãn khoản nợ để hiển thị tách dòng: CUSTOMER_REFUND | DRIVER_COMPENSATION |
   * PLATFORM_FUND. NULL = khoản nợ cũ (trước khi có nhãn).
   */
  @Index()
  @Column({ type: "varchar", length: 40, nullable: true })
  category!: string | null;

  /** Diễn giải cho chủ ví, vd "Hoàn tiền cho khách đơn #5657c728". */
  @Column({ type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Index()
  @Column({ type: "varchar", length: 20, default: "OPEN" })
  status!: string; // OPEN | PARTIAL | SETTLED

  /** Thời điểm nợ về 0 — dùng để đo tuổi nợ / đối soát. */
  @Column({ type: "timestamptz", nullable: true })
  settledAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
