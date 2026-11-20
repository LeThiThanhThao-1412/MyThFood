import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

@Entity("notifications")
export class NotificationEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 50 })
  type!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text", nullable: true })
  body!: string | null;

  @Column({ type: "jsonb", nullable: true })
  data!: Record<string, unknown>;

  @Column({ type: "boolean", default: false })
  isRead!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
