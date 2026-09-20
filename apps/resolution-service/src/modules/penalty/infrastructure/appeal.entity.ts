import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("appeals")
@Index(["penaltyId"], { unique: true })
export class AppealEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  penaltyId!: string;

  @Column({ type: "varchar", length: 100 })
  appealedBy!: string;

  @Column({ type: "varchar", length: 20 })
  appealedByType!: string;

  @Column({ type: "text" })
  reason!: string;

  @Column({ type: "jsonb", nullable: true })
  evidence!: string[] | null;

  @Column({ type: "varchar", length: 20 })
  status!: string;

  @Column({ type: "timestamptz", nullable: true })
  deadline!: Date | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  decidedBy!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
