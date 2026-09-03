import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { IRepository } from "@mythfood/shared-kernel";
import { Order } from "../domain/order.aggregate";
import { OrderId } from "../domain/order-id";
import { OrderEntity } from "./order.entity";
import { OrderItemEntity } from "./order-item.entity";
import { OrderMapper } from "./order.mapper";

@Injectable()
export class OrderRepository implements IRepository<Order, OrderId> {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repository: TypeOrmRepo<OrderEntity>,
    @InjectRepository(OrderItemEntity)
    private readonly orderItemRepo: TypeOrmRepo<OrderItemEntity>,
  ) {}

  async save(aggregate: Order): Promise<void> {
    const entity = OrderMapper.toPersistence(aggregate);
    await this.repository.save(entity);

    // Delete old items first to avoid duplicates on update
    await this.orderItemRepo.delete({ order_id: entity.id });

    // Save order items
    const itemEntities = OrderMapper.itemsToPersistence(aggregate);
    await this.orderItemRepo.save(itemEntities);
  }

  async findById(id: OrderId): Promise<Order | null> {
    const entity = await this.repository.findOne({
      where: { id: id.toString() },
    });
    if (!entity) {
      return null;
    }
    return this.loadRelatedAndMap(entity);
  }

  async findByIdOrFail(id: OrderId): Promise<Order> {
    const order = await this.findById(id);
    if (!order) {
      throw new Error(`Order with id ${id.toString()} not found`);
    }
    return order;
  }

  async getCreatedAt(id: string): Promise<Date | null> {
    const entity = await this.repository.findOne({
      where: { id },
      select: ["id", "created_at"],
    });
    return entity?.created_at ?? null;
  }

  async findByConsumerId(consumerId: string): Promise<Order[]> {
    const entities = await this.repository.find({
      where: { consumer_id: consumerId },
      order: { created_at: "DESC" },
    });
    return Promise.all(entities.map((e) => this.loadRelatedAndMap(e)));
  }

  async findByMerchantId(merchantId: string): Promise<Order[]> {
    const entities = await this.repository.find({
      where: { merchant_id: merchantId },
      order: { created_at: "DESC" },
    });
    return Promise.all(entities.map((e) => this.loadRelatedAndMap(e)));
  }

  async findByDriverId(driverId: string): Promise<Order[]> {
    const entities = await this.repository.find({
      where: { driver_id: driverId },
      order: { created_at: "DESC" },
    });
    return Promise.all(entities.map((e) => this.loadRelatedAndMap(e)));
  }

  async findAll(options?: {
    status?: string;
    merchantId?: string;
    consumerId?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Order[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (options?.status) {
      where["status"] = options.status;
    }
    if (options?.merchantId) {
      where["merchant_id"] = options.merchantId;
    }
    if (options?.consumerId) {
      where["consumer_id"] = options.consumerId;
    }

    const queryBuilder = this.repository
      .createQueryBuilder("order")
      .where(where)
      .andWhere("order.deleted_at IS NULL")
      .orderBy("order.created_at", "DESC");

    if (options?.skip !== undefined) {
      queryBuilder.skip(options.skip);
    }
    if (options?.take !== undefined) {
      queryBuilder.take(options.take);
    }

    const [entities, total] = await queryBuilder.getManyAndCount();
    const items = await Promise.all(
      entities.map((e) => this.loadRelatedAndMap(e)),
    );
    return { items, total };
  }

  async exists(id: OrderId): Promise<boolean> {
    const count = await this.repository.count({ where: { id: id.toString() } });
    return count > 0;
  }

  async delete(aggregate: Order): Promise<void> {
    await this.repository.softDelete(aggregate.id.toString());
  }

  async deleteById(id: OrderId): Promise<void> {
    await this.repository.softDelete(id.toString());
  }

  async findPendingOlderThan(cutoff: Date): Promise<Order[]> {
    const entities = await this.repository.find({
      where: { status: "PENDING" },
      order: { created_at: "ASC" },
    });

    // Filter in-memory: only orders created before cutoff
    const expired = entities.filter((e) => new Date(e.created_at) < cutoff);
    return Promise.all(expired.map((e) => this.loadRelatedAndMap(e)));
  }

  async getDailyStats(options?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{ dailyStats: any[]; summary: any }> {
    const qb = this.repository
      .createQueryBuilder("o")
      .select("TO_CHAR(o.created_at, 'YYYY-MM-DD')", "date")
      .addSelect("COUNT(*)", "orders")
      .addSelect("COALESCE(SUM(o.total_amount), 0)", "revenue")
      .where("o.deleted_at IS NULL")
      .andWhere("o.status != :cancelled", { cancelled: "CANCELLED" })
      .andWhere("o.status != :rejected", { rejected: "REJECTED" });

    if (options?.startDate) {
      qb.andWhere("o.created_at >= :startDate", {
        startDate: new Date(options.startDate),
      });
    }
    if (options?.endDate) {
      qb.andWhere("o.created_at <= :endDate", {
        endDate: new Date(options.endDate),
      });
    }

    qb.groupBy("TO_CHAR(o.created_at, 'YYYY-MM-DD')").orderBy("date", "ASC");
    const rows = await qb.getRawMany();

    const dailyStats = rows.map((r) => ({
      date: r.date,
      orders: Number(r.orders ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));

    const summary = dailyStats.reduce(
      (acc, d) => {
        acc.totalOrders += d.orders;
        acc.totalRevenue += d.revenue;
        return acc;
      },
      { totalOrders: 0, totalRevenue: 0 },
    );

    return { dailyStats, summary };
  }

  async getMerchantStats(
    merchantId: string,
    options?: { startDate?: string; endDate?: string },
  ): Promise<any> {
    const applyDateRange = (qb: any) => {
      if (options?.startDate) {
        qb.andWhere("o.created_at >= :startDate", {
          startDate: new Date(options.startDate),
        });
      }
      if (options?.endDate) {
        qb.andWhere("o.created_at <= :endDate", {
          endDate: new Date(options.endDate),
        });
      }
    };

    const totalOrdersQb = this.repository
      .createQueryBuilder("o")
      .where("o.merchant_id = :merchantId", { merchantId })
      .andWhere("o.deleted_at IS NULL");
    applyDateRange(totalOrdersQb);
    const totalOrders = await totalOrdersQb.getCount();

    const revenueQb = this.repository
      .createQueryBuilder("o")
      .select("COALESCE(SUM(o.total_amount), 0)", "revenue")
      .where("o.merchant_id = :merchantId", { merchantId })
      .andWhere("o.deleted_at IS NULL")
      .andWhere("o.status != :cancelled", { cancelled: "CANCELLED" })
      .andWhere("o.status != :rejected", { rejected: "REJECTED" });
    applyDateRange(revenueQb);
    const revenueRow = await revenueQb.getRawOne();

    const pendingOrders = await this.repository
      .createQueryBuilder("o")
      .where("o.merchant_id = :merchantId", { merchantId })
      .andWhere("o.deleted_at IS NULL")
      .andWhere("o.status = :pending", { pending: "PENDING" })
      .getCount();

    const byDayQb = this.repository
      .createQueryBuilder("o")
      .select("TO_CHAR(o.created_at, 'YYYY-MM-DD')", "date")
      .addSelect("COUNT(*)", "orders")
      .addSelect("COALESCE(SUM(o.total_amount), 0)", "revenue")
      .where("o.merchant_id = :merchantId", { merchantId })
      .andWhere("o.deleted_at IS NULL")
      .andWhere("o.status != :cancelled", { cancelled: "CANCELLED" })
      .andWhere("o.status != :rejected", { rejected: "REJECTED" });
    applyDateRange(byDayQb);
    byDayQb
      .groupBy("TO_CHAR(o.created_at, 'YYYY-MM-DD')")
      .orderBy("date", "ASC");
    const revenueByDay = (await byDayQb.getRawMany()).map((r) => ({
      date: r.date,
      orders: Number(r.orders ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));

    const topItemsQb = this.orderItemRepo
      .createQueryBuilder("mi")
      .select("mi.menu_item_id", "menuItemId")
      .addSelect("MAX(mi.name)", "name")
      .addSelect("SUM(mi.quantity)", "quantity")
      .addSelect("COALESCE(SUM(mi.quantity * mi.unit_price), 0)", "revenue")
      .innerJoin(OrderEntity, "o", "o.id = mi.order_id")
      .where("o.merchant_id = :merchantId", { merchantId })
      .andWhere("o.deleted_at IS NULL")
      .andWhere("o.status != :cancelled", { cancelled: "CANCELLED" })
      .andWhere("o.status != :rejected", { rejected: "REJECTED" });
    applyDateRange(topItemsQb);
    topItemsQb.groupBy("mi.menu_item_id").orderBy("quantity", "DESC").limit(10);
    const topItems = (await topItemsQb.getRawMany()).map((r) => ({
      menuItemId: r.menuItemId,
      name: r.name,
      quantity: Number(r.quantity ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));

    return {
      merchantId,
      totalOrders,
      totalRevenue: Number(revenueRow?.revenue ?? 0),
      pendingOrders,
      revenueByDay,
      topItems,
    };
  }

  private async loadRelatedAndMap(entity: OrderEntity): Promise<Order> {
    const items = await this.orderItemRepo.find({
      where: { order_id: entity.id },
    });
    return OrderMapper.toDomain(entity, items);
  }
}
