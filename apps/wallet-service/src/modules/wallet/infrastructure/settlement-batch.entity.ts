import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("settlement_batches")
@Index(["periodStart", "periodEnd"], { unique: true })
export class SettlementBatchEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "timestamptz" })
  periodStart!: Date;

  @Column({ type: "timestamptz" })
  periodEnd!: Date;

  @Index()
  @Column({ type: "varchar", length: 20, default: "PENDING" })
  status!: string; // PENDING | PROCESSING | SUCCESS | FAILED | NEEDS_REVIEW

  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  totalDriverPayout!: number;

  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  totalMerchantPayout!: number;

  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  totalPlatformPayout!: number;

  @Column({ type: "varchar", length: 100, nullable: true })
  triggeredBy!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
