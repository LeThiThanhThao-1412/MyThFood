import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../auth/service-key-or-jwt.guard";
import { ChatService } from "./chat.service";
import {
  GetOrCreateConversationDto,
  SendMessageDto,
  MarkDeliveredDto,
} from "./chat.dto";
import { Request } from "express";

@Controller("chat")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post("conversations")
  @Roles("CONSUMER", "DRIVER", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async getOrCreateConversation(@Body() dto: GetOrCreateConversationDto) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.chatService.getOrCreateConversation(dto),
    };
  }

  @Post("conversations/mark-delivered")
  @Roles("DRIVER", "ADMIN")
  async markDelivered(@Body() dto: MarkDeliveredDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.chatService.markDelivered(dto.orderId, dto.deliveredAt),
    };
  }

  @Get("conversations/user/:userId")
  @Roles("CONSUMER", "DRIVER", "ADMIN")
  async listConversations(@Param("userId") userId: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.chatService.listConversations(userId),
    };
  }

  @Get("conversations/:id/messages")
  @Roles("CONSUMER", "DRIVER", "ADMIN")
  async getMessages(@Param("id") id: string, @Req() req: Request) {
    const userId = (req as any).user?.userId;
    return {
      statusCode: HttpStatus.OK,
      data: await this.chatService.getMessages(id, userId),
    };
  }

  @Post("conversations/:id/messages")
  @Roles("CONSUMER", "DRIVER", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
  ) {
    const senderId = (req as any).user?.userId;
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.chatService.sendMessage(id, senderId, dto),
    };
  }
}
