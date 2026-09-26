import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { ConversationEntity } from "./conversation.entity";
import { ChatMessageEntity } from "./chat-message.entity";

@WebSocketGateway({
  cors: { origin: "*", methods: ["GET", "POST"] },
  namespace: "/chat",
})
export class ChatGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  @SubscribeMessage("join:user")
  handleJoinUser(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.userId) return;
    const room = `user:${data.userId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  emitNewMessage(
    conversation: ConversationEntity,
    message: ChatMessageEntity,
  ) {
    const payload = this.serializeMessage(message);
    // Gửi tới cả 2 người tham gia (người gửi để đồng bộ đa thiết bị,
    // người nhận để hiện thông báo + cập nhật realtime).
    this.server.to(`user:${conversation.consumerUserId}`).emit("chat:new-message", {
      conversationId: conversation.id,
      message: payload,
    });
    this.server.to(`user:${conversation.driverUserId}`).emit("chat:new-message", {
      conversationId: conversation.id,
      message: payload,
    });
  }

  private serializeMessage(message: ChatMessageEntity) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderRole: message.senderRole,
      type: message.type,
      content: message.content,
      createdAt: message.createdAt,
    };
  }
}
