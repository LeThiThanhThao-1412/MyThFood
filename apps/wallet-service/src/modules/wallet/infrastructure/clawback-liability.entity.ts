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

  @Index()
  @Column({ type: "varchar", length: 20, default: "OPEN" })
  status!: string; // OPEN | PARTIAL | SETTLED

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
