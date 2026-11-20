import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { NotificationEntity } from "./notification.entity";

@Injectable()
export class NotificationRepository {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: TypeOrmRepo<NotificationEntity>,
  ) {}

  async save(notification: NotificationEntity): Promise<NotificationEntity> {
    return this.repo.save(notification);
  }

  async findById(id: string): Promise<NotificationEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByUserId(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{
    items: NotificationEntity[];
    total: number;
    unreadCount: number;
  }> {
    const [items, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: "DESC" },
      skip,
      take,
    });
    const unreadCount = await this.repo.count({
      where: { userId, isRead: false },
    });
    return { items, total, unreadCount };
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.update({ userId, isRead: false }, { isRead: true });
  }
}
