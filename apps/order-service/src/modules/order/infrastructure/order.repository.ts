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

  private async loadRelatedAndMap(entity: OrderEntity): Promise<Order> {
    const items = await this.orderItemRepo.find({
      where: { order_id: entity.id },
    });
    return OrderMapper.toDomain(entity, items);
  }
}
