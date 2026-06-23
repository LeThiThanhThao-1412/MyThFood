import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { IRepository } from "@mythfood/shared-kernel";
import { Consumer } from "../domain/consumer.aggregate";
import { ConsumerId } from "../domain/consumer-id";
import { ConsumerEntity } from "./consumer.entity";
import { ConsumerMapper } from "./consumer.mapper";

@Injectable()
export class ConsumerRepository implements IRepository<Consumer, ConsumerId> {
  constructor(
    @InjectRepository(ConsumerEntity)
    private readonly repository: TypeOrmRepo<ConsumerEntity>,
  ) {}

  async save(aggregate: Consumer): Promise<void> {
    const entity = ConsumerMapper.toPersistence(aggregate);
    await this.repository.save(entity);
  }

  async findById(id: ConsumerId): Promise<Consumer | null> {
    const entity = await this.repository.findOne({
      where: { id: id.toString() },
    });
    if (!entity) return null;
    return ConsumerMapper.toDomain(entity);
  }

  async findByIdOrFail(id: ConsumerId): Promise<Consumer> {
    const consumer = await this.findById(id);
    if (!consumer)
      throw new Error(`Consumer with id ${id.toString()} not found`);
    return consumer;
  }

  async findByUserId(userId: string): Promise<Consumer | null> {
    const entity = await this.repository.findOne({
      where: { user_id: userId },
    });
    if (!entity) return null;
    return ConsumerMapper.toDomain(entity);
  }

  async exists(id: ConsumerId): Promise<boolean> {
    const count = await this.repository.count({ where: { id: id.toString() } });
    return count > 0;
  }

  async delete(aggregate: Consumer): Promise<void> {
    await this.repository.softDelete(aggregate.id.toString());
  }

  async deleteById(id: ConsumerId): Promise<void> {
    await this.repository.softDelete(id.toString());
  }
}
