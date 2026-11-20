import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository as TypeOrmRepo } from "typeorm";
import { ConversationEntity } from "./conversation.entity";
import { ChatMessageEntity } from "./chat-message.entity";

@Injectable()
export class ChatRepository {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversations: TypeOrmRepo<ConversationEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messages: TypeOrmRepo<ChatMessageEntity>,
  ) {}

  saveConversation(conversation: ConversationEntity) {
    return this.conversations.save(conversation);
  }

  findConversationById(id: string) {
    return this.conversations.findOne({ where: { id } });
  }

  findConversationByOrderId(orderId: string) {
    return this.conversations.findOne({ where: { orderId } });
  }

  /** Chỉ trả về hội thoại còn hiệu lực (chưa hết hạn soft-delete). */
  findActiveConversationsForUser(userId: string) {
    return this.conversations
      .createQueryBuilder("c")
      .where("(c.expiresAt IS NULL OR c.expiresAt > NOW())")
      .andWhere("(c.consumerUserId = :userId OR c.driverUserId = :userId)", {
        userId,
      })
      .orderBy("c.lastMessageAt", "DESC", "NULLS LAST")
      .addOrderBy("c.createdAt", "DESC")
      .getMany();
  }

  async findMessagesByConversation(conversationId: string) {
    return this.messages.find({
      where: { conversationId },
      order: { createdAt: "ASC" },
    });
  }

  saveMessage(message: ChatMessageEntity) {
    return this.messages.save(message);
  }

  findLastMessage(conversationId: string) {
    return this.messages.findOne({
      where: { conversationId },
      order: { createdAt: "DESC" },
    });
  }

  async deleteMessagesByConversation(conversationId: string) {
    await this.messages.delete({ conversationId });
  }

  async deleteConversation(id: string) {
    await this.conversations.delete({ id });
  }

  findExpiredConversations(cutoff: Date) {
    return this.conversations.find({
      where: { hardDeleteAt: LessThan(cutoff) },
    });
  }
}
