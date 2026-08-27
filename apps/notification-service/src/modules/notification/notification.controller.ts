import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../auth/service-key-or-jwt.guard";
import { NotificationService } from "./notification.service";
import {
  CreateNotificationDto,
  ReadAllNotificationsDto,
} from "./notification.dto";

@Controller("notifications")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notifService: NotificationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateNotificationDto) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.notifService.create(dto),
    };
  }

  @Get("user/:userId")
  async getByUser(
    @Param("userId") userId: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    const result = await this.notifService.getByUserId(
      userId,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
    return {
      statusCode: HttpStatus.OK,
      data: result.items,
      total: result.total,
      unreadCount: result.unreadCount,
    };
  }

  @Patch("read-all")
  async markAllRead(@Body() dto: ReadAllNotificationsDto) {
    await this.notifService.markAllRead(dto.userId);
    return { statusCode: HttpStatus.OK };
  }

  @Patch(":id/read")
  async markRead(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.notifService.markRead(id),
    };
  }
}
