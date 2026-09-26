import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { HttpService } from "@nestjs/axios";
import { v4 as uuidv4 } from "uuid";
import { ChatRepository } from "./chat.repository";
import { ConversationEntity } from "./conversation.entity";
import { ChatMessageEntity } from "./chat-message.entity";
import { ChatGateway } from "./chat.gateway";

/** Khoảng thời gian giữ tin nhắn hiển thị sau khi giao thành công (3 giờ). */
const SOFT_TTL_MS = 3 * 60 * 60 * 1000;
/** Khoảng thời gian giữ dữ liệu trong DB trước khi xóa cứng (5 ngày). */
const HARD_TTL_MS = 5 * 24 * 60 * 60 * 1000;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly repo: ChatRepository,
    private readonly gateway: ChatGateway,
    private readonly httpService: HttpService,
  ) {}

  async getOrCreateConversation(dto: {
    orderId: string;
    consumerUserId: string;
    driverUserId: string;
  }): Promise<ConversationEntity> {
    const existing = await this.repo.findConversationByOrderId(dto.orderId);
    if (existing) return existing;

    const conversation = new ConversationEntity();
    conversation.id = uuidv4();
    conversation.orderId = dto.orderId;
    conversation.consumerUserId = dto.consumerUserId;
    conversation.driverUserId = dto.driverUserId;
    conversation.lastMessageAt = null;
    conversation.expiresAt = null;
    conversation.hardDeleteAt = null;
    return this.repo.saveConversation(conversation);
  }

  async listConversations(userId: string) {
    const conversations = await this.repo.findActiveConversationsForUser(userId);
    const enriched = [];
    for (const conversation of conversations) {
      const lastMessage = await this.repo.findLastMessage(conversation.id);
      enriched.push({ ...conversation, lastMessage });
    }
    return enriched;
  }

  async getMessages(
    conversationId: string,
    userId: string,
  ): Promise<ChatMessageEntity[]> {
    const conversation = await this.requireActiveConversation(
      conversationId,
      userId,
    );
    return this.repo.findMessagesByConversation(conversation.id);
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    payload: { type: string; content: string },
  ): Promise<ChatMessageEntity> {
    const conversation = await this.requireActiveConversation(
      conversationId,
      senderId,
    );

    const senderRole = this.resolveSenderRole(conversation, senderId);
    const recipientUserId =
      senderRole === "DRIVER"
        ? conversation.consumerUserId
        : conversation.driverUserId;

    const message = new ChatMessageEntity();
    message.id = uuidv4();
    message.conversationId = conversation.id;
    message.senderId = senderId;
    message.senderRole = senderRole;
    message.type = payload.type;
    message.content = payload.content;

    const saved = await this.repo.saveMessage(message);

    conversation.lastMessageAt = new Date();
    await this.repo.saveConversation(conversation);

    // Realtime tới cả 2 bên tham gia.
    this.gateway.emitNewMessage(conversation, saved);

    // Thông báo in-app cho người nhận.
    await this.notifyRecipient(conversation, senderRole, recipientUserId);

    return saved;
  }

  async markDelivered(
    orderId: string,
    deliveredAt?: string,
  ): Promise<ConversationEntity | null> {
    const conversation = await this.repo.findConversationByOrderId(orderId);
    if (!conversation) return null;

    const delivered = deliveredAt ? new Date(deliveredAt) : new Date();
    conversation.expiresAt = new Date(delivered.getTime() + SOFT_TTL_MS);
    conversation.hardDeleteAt = new Date(delivered.getTime() + HARD_TTL_MS);
    return this.repo.saveConversation(conversation);
  }

  private async requireActiveConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationEntity> {
    const conversation =
      await this.repo.findConversationById(conversationId);
    if (!conversation) throw new NotFoundException("Hội thoại không tồn tại");

    if (
      conversation.expiresAt &&
      conversation.expiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException("Hội thoại đã hết hạn");
    }

    const isParticipant =
      conversation.consumerUserId === userId ||
      conversation.driverUserId === userId;
    if (!isParticipant) {
      throw new ForbiddenException("Bạn không thuộc hội thoại này");
    }

    return conversation;
  }

  private resolveSenderRole(
    conversation: ConversationEntity,
    senderId: string,
  ): "CONSUMER" | "DRIVER" {
    if (conversation.driverUserId === senderId) return "DRIVER";
    if (conversation.consumerUserId === senderId) return "CONSUMER";
    throw new ForbiddenException("Bạn không thuộc hội thoại này");
  }

  private async notifyRecipient(
    conversation: ConversationEntity,
    senderRole: "CONSUMER" | "DRIVER",
    recipientUserId: string,
  ): Promise<void> {
    const candidates = [
      process.env.NOTIFICATION_SERVICE_URL,
      "http://notification-service:3013",
      "http://localhost:3013",
    ].filter((u): u is string => !!u);
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    const senderLabel = senderRole === "DRIVER" ? "Tài xế" : "Khách hàng";
    const payload = {
      userId: recipientUserId,
      type: "CHAT_MESSAGE",
      title: "Tin nhắn mới",
      body: `${senderLabel} đã gửi tin nhắn về đơn #${conversation.orderId.slice(0, 8)}`,
      data: {
        conversationId: conversation.id,
        orderId: conversation.orderId,
      },
    };

    for (const base of new Set(candidates)) {
      try {
        await firstValueFrom(
          this.httpService.post(`${base}/api/v1/notifications`, payload, {
            headers: { "x-service-key": serviceKey },
          }),
        );
        return;
      } catch (err: any) {
        this.logger.warn(
          `Không gửi được notification chat qua ${base}: ${err?.message}`,
        );
      }
    }
  }
}
