import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("conversations")
@Index("idx_conversations_order", ["orderId"], { unique: true })
export class ConversationEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  orderId!: string;

  /** Identity userId của khách hàng (dùng cho notification + socket room). */
  @Column({ type: "uuid" })
  consumerUserId!: string;

  /** Identity userId của tài xế (dùng cho notification + socket room). */
  @Column({ type: "uuid" })
  driverUserId!: string;

  @Column({ type: "timestamptz", nullable: true })
  lastMessageAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  /** Soft-hide threshold = deliveredAt + 3h (NULL while order not delivered). */
  @Column({ type: "timestamptz", nullable: true })
  expiresAt!: Date | null;

  /** Hard-delete threshold = deliveredAt + 5 days (NULL while not delivered). */
  @Column({ type: "timestamptz", nullable: true })
  hardDeleteAt!: Date | null;
}
