import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("settlement_entries")
@Index(["orderId", "kind"], { unique: true })
export class SettlementEntryEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 100 })
  orderId!: string;

  @Index()
  @Column({ type: "varchar", length: 100 })
  ownerId!: string;

  @Index()
  @Column({ type: "varchar", length: 20 })
  ownerType!: string;

  @Column("decimal", { precision: 14, scale: 2 })
  amount!: number;

  @Column({ type: "varchar", length: 50 })
  kind!: string; // MERCHANT_FOOD_REVENUE | DRIVER_SHIPPING_FEE | PLATFORM_COMMISSION

  @Index()
  @Column({ type: "varchar", length: 20, default: "PENDING" })
  status!: string; // PENDING | HELD_BY_DISPUTE | SETTLED

  @Index()
  @Column({ type: "varchar", length: 100, nullable: true })
  settlementBatchId!: string | null;

  @Index()
  @Column({ type: "timestamptz", nullable: true })
  deliveredAt!: Date | null;

  /**
   * Vụ việc (case) đã giữ/mở khoá dòng doanh thu này — để admin đối soát được
   * "vì sao tiền của đơn này bị giữ" và "case nào đã trả lại tiền".
   */
  @Index()
  @Column({ type: "varchar", length: 100, nullable: true })
  caseId!: string | null;

  /**
   * Ngày dòng doanh thu được đưa vào quyết toán (mốc 23:00 của **ngày phán
   * quyết** case). NULL = chưa từng bị giữ, dùng `deliveredAt`.
   *
   * Vì sao cần: dòng bị HELD_BY_DISPUTE lâu ngày có `deliveredAt` rất cũ, nên
   * lô quyết toán chạy tay/dry-run theo cửa sổ `deliveredAt` sẽ bỏ sót. Ghi
   * riêng `settleOn` cho phép dòng được quyết toán đúng ngày case được giải
   * quyết mà không phải bịa lại `deliveredAt`.
   */
  @Index()
  @Column({ type: "timestamptz", nullable: true })
  settleOn!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
