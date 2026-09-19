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
  status!: string; // PENDING | SETTLED

  @Index()
  @Column({ type: "varchar", length: 100, nullable: true })
  settlementBatchId!: string | null;

  @Index()
  @Column({ type: "timestamptz", nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
