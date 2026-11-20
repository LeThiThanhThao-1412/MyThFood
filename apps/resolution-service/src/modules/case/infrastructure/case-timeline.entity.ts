import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("case_timeline")
@Index(["caseId"])
export class CaseTimelineEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  caseId!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  fromStatus!: string | null;

  @Column({ type: "varchar", length: 20 })
  toStatus!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  actorId!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  actorType!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
