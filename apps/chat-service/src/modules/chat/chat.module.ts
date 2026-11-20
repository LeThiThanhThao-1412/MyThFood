import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { ConversationEntity } from "./conversation.entity";
import { ChatMessageEntity } from "./chat-message.entity";
import { ChatRepository } from "./chat.repository";
import { ChatService } from "./chat.service";
import { ChatController } from "./chat.controller";
import { ChatGateway } from "./chat.gateway";
import { ChatScheduler } from "./chat.scheduler";

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationEntity, ChatMessageEntity]),
    HttpModule,
  ],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService, ChatGateway, ChatScheduler],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
