import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("chat_messages")
@Index("idx_chat_messages_conversation", ["conversationId"])
export class ChatMessageEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  conversationId!: string;

  @Column({ type: "uuid" })
  senderId!: string;

  @Column({ type: "varchar", length: 20 })
  senderRole!: string;

  @Column({ type: "varchar", length: 20 })
  type!: string;

  @Column({ type: "text" })
  content!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
