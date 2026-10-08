import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MenuUpdatedEvent } from "../domain/events/menu-updated.event";
import { PriceHistoryRepository } from "../infrastructure/price-history.repository";
import { PriceHistoryEntity } from "../infrastructure/price-history.entity";
import { PriceAlertEntity } from "../infrastructure/price-alert.entity";

const FLAG_THRESHOLD_PERCENT = 50;

/**
 * Tự động ghi nhận lịch sử biến động giá mỗi khi có sự kiện PRICE_CHANGED,
 * đồng thời sinh cảnh báo nếu giá thay đổi vượt ngưỡng (> 50%).
 */
@EventsHandler(MenuUpdatedEvent)
export class MenuUpdatedEventHandler implements IEventHandler<MenuUpdatedEvent> {
  private readonly logger = new Logger(MenuUpdatedEventHandler.name);

  constructor(private readonly priceHistoryRepo: PriceHistoryRepository) {}

  async handle(event: MenuUpdatedEvent): Promise<void> {
    try {
      if (event.payload.action !== "PRICE_CHANGED") {
        return;
      }

      const oldPrice = Number(event.payload.oldPrice ?? 0);
      const newPrice = Number(event.payload.newPrice ?? 0);
      const changePercent =
        oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
      const isFlagged = Math.abs(changePercent) > FLAG_THRESHOLD_PERCENT;

      const history = new PriceHistoryEntity();
      history.id = randomUUID();
      history.merchant_id = event.payload.merchantId;
      history.menu_item_id = event.payload.menuItemId;
      history.old_price = oldPrice;
      history.new_price = newPrice;
      history.changed_by = event.payload.changedBy ?? null;
      history.reason = event.payload.reason ?? null;
      history.status = isFlagged ? "FLAGGED" : "RECORDED";
      await this.priceHistoryRepo.save(history);

      if (isFlagged) {
        const alert = new PriceAlertEntity();
        alert.id = randomUUID();
        alert.merchant_id = event.payload.merchantId;
        alert.menu_item_id = event.payload.menuItemId;
        alert.old_price = oldPrice;
        alert.new_price = newPrice;
        alert.change_percent = Number(changePercent.toFixed(2));
        alert.message = `Giá món "${event.payload.name}" thay đổi ${changePercent.toFixed(2)}% (${oldPrice}đ → ${newPrice}đ)`;
        alert.is_read = false;
        await this.priceHistoryRepo.saveAlert(alert);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to record price history: ${err?.message ?? err}`,
      );
    }
  }
}
