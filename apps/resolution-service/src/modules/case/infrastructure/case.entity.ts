import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("cases")
@Index(["status"])
@Index(["type"])
@Index(["category"])
@Index(["respondentId"])
export class CaseEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar", length: 40 })
  caseNumber!: string;

  @Column({ type: "varchar", length: 30 })
  type!: string;

  @Column({ type: "varchar", length: 50 })
  category!: string;

  @Column({ type: "varchar", length: 20 })
  severity!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  orderId!: string | null;

  @Column({ type: "varchar", length: 100 })
  reporterId!: string;

  @Column({ type: "varchar", length: 20 })
  reporterType!: string;

  @Column({ type: "varchar", length: 100 })
  respondentId!: string;

  @Column({ type: "varchar", length: 20 })
  respondentType!: string;

  @Column({ type: "varchar", length: 255 })
  subject!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "jsonb", nullable: true })
  evidence!: string[] | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  verdict!: string | null;

  @Column({ type: "text", nullable: true })
  resolutionNote!: string | null;

  @Column({ type: "varchar", length: 20 })
  status!: string;

  @Column({ type: "jsonb", nullable: true })
  penaltyIds!: string[] | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  resolvedBy!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  respondentResponse!: string | null;

  @Column({ type: "jsonb", nullable: true })
  respondentEvidence!: string[] | null;

  @Column({ type: "timestamptz", nullable: true })
  respondentRespondedAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  responseDeadline!: Date | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  faultParty!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
