import { Injectable, NotFoundException } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { NotificationRepository } from "./notification.repository";
import { NotificationEntity } from "./notification.entity";
import { CreateNotificationDto } from "./notification.dto";

@Injectable()
export class NotificationService {
  constructor(private readonly notifRepo: NotificationRepository) {}

  async create(dto: CreateNotificationDto): Promise<NotificationEntity> {
    const notif = new NotificationEntity();
    notif.id = uuidv4();
    notif.userId = dto.userId;
    notif.type = dto.type;
    notif.title = dto.title;
    notif.body = dto.body ?? null;
    notif.data = dto.data ?? {};
    notif.isRead = false;
    return this.notifRepo.save(notif);
  }

  async getByUserId(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{
    items: NotificationEntity[];
    total: number;
    unreadCount: number;
  }> {
    return this.notifRepo.findByUserId(userId, skip, take);
  }

  async markRead(id: string): Promise<NotificationEntity> {
    const notif = await this.notifRepo.findById(id);
    if (!notif) throw new NotFoundException("Notification not found");
    notif.isRead = true;
    return this.notifRepo.save(notif);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifRepo.markAllRead(userId);
  }
}
