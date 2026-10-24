import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("clawback_deductions")
export class ClawbackDeductionEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column("uuid")
  clawbackId!: string;

  @Index()
  @Column({ type: "varchar", length: 100, nullable: true })
  settlementBatchId!: string | null;

  /**
   * Nguồn khấu trừ:
   *  - BATCH       : trừ trong lô quyết toán 23:00
   *  - AUTO_CREDIT : trừ ngay khi ví có tiền vào (hook credit())
   *  - AUTO_SWEEP  : trừ bởi cron quét nợ
   *  - MANUAL      : admin/script
   */
  @Column({ type: "varchar", length: 20, default: "BATCH" })
  source!: string;

  /** Tham chiếu giao dịch tiền vào đã dùng để khấu trừ (chống trừ trùng). */
  @Column({ type: "varchar", length: 50, nullable: true })
  referenceType!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  referenceId!: string | null;

  @Column("decimal", { precision: 14, scale: 2 })
  amount!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
