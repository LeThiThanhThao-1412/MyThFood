import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ChatRepository } from "./chat.repository";

@Injectable()
export class ChatScheduler {
  private readonly logger = new Logger(ChatScheduler.name);

  constructor(private readonly repo: ChatRepository) {}

  /** Xóa cứng hội thoại + tin nhắn đã quá hạn hardDeleteAt (5 ngày sau giao). */
  @Cron(CronExpression.EVERY_MINUTE)
  async purgeHardDeletedConversations() {
    try {
      const expired = await this.repo.findExpiredConversations(new Date());
      for (const conversation of expired) {
        await this.repo.deleteMessagesByConversation(conversation.id);
        await this.repo.deleteConversation(conversation.id);
        this.logger.log(
          `Purged expired conversation ${conversation.id} (order ${conversation.orderId})`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Purge scheduler error: ${err.message}`);
    }
  }
}
