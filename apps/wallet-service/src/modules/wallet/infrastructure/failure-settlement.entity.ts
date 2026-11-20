import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * Sổ chống trùng (idempotency ledger) cho việc route tiền khi đơn giao thất bại
 * đã có phán quyết cuối cùng.
 *
 * PK = orderId ⇒ mỗi đơn chỉ được settle đúng MỘT lần ở mức database, chặn
 * double-payout khi settleFailureMoney() bị gọi lại (resolve / confirm /
 * applyAiDecision / autoResolveExpiredResponse đều là fire-and-forget).
 *
 * Đồng thời là bản ghi đối soát: tổng đã hoàn khách, đã bồi thường tài xế,
 * đã thu hồi từ nhà hàng, phần nền tảng phải tự chịu.
 */
@Entity("failure_settlements")
export class FailureSettlementEntity {
  @PrimaryColumn({ type: "varchar", length: 100 })
  orderId!: string;

  @Column({ type: "varchar", length: 20 })
  faultParty!: string;

  @Column({ type: "varchar", length: 20 })
  severity!: string;

  @Index()
  @Column({ type: "varchar", length: 20, default: "COMPLETED" })
  status!: string; // COMPLETED | FAILED

  @Column({ type: "boolean", default: false })
  isOnline!: boolean;

  /** Tiền hoàn cho khách (store credit). */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  refundAmount!: number;

  /** Tiền bồi thường tài xế (net shipping income, không phải full phí ship). */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  driverCompensation!: number;

  /** Tiền thu hồi được từ nhà hàng (phần thực trừ được trong ví). */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  merchantDebit!: number;

  /** Phần nhà hàng còn nợ (không đủ số dư ví) → clawback_liabilities. */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  merchantClawback!: number;

  /** Tiền thu hồi được từ tài xế. */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  driverDebit!: number;

  /** Phần tài xế còn nợ (không đủ số dư ví) → clawback_liabilities. */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  driverClawback!: number;

  /** Tiền phạt đã thu được (chuyển về PLATFORM_DEFAULT, không bị "bốc hơi"). */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  fine!: number;

  /** Ứng từ quỹ dự phòng (COD / lỗi hệ thống). */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  reserveDisbursed!: number;

  /**
   * Phần chi ra mà không có nguồn bù (không thu được từ nhà hàng/tài xế và
   * không có escrow của đơn) ⇒ lỗ thực tế của nền tảng, cần đối soát.
   */
  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  platformFunding!: number;

  @Column({ type: "jsonb", nullable: true })
  detail!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
