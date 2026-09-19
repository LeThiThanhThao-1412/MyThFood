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

  @Column("decimal", { precision: 14, scale: 2 })
  amount!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
