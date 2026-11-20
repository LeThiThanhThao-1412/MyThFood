import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("penalties")
@Index(["caseId"])
@Index(["targetId"])
@Index(["status"])
export class PenaltyEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  caseId!: string;

  @Column({ type: "varchar", length: 30 })
  type!: string;

  @Column({ type: "varchar", length: 100 })
  targetId!: string;

  @Column({ type: "varchar", length: 20 })
  targetType!: string;

  @Column({ type: "decimal", precision: 14, scale: 2, nullable: true })
  amount!: number | null;

  @Column({ type: "int", nullable: true })
  durationDays!: number | null;

  @Column({ type: "varchar", length: 20 })
  status!: string;

  @Column({ type: "text" })
  reason!: string;

  @Column({ type: "timestamptz", nullable: true })
  deadline!: Date | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  appliedBy!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  appliedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
