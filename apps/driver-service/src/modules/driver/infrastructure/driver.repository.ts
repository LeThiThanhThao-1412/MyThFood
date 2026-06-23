import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo, IsNull } from "typeorm";
import { IRepository, EntityNotFoundError } from "@mythfood/shared-kernel";
import {
  Driver,
  DriverStatus,
  DriverOnlineStatus,
} from "../domain/driver.aggregate";
import { DriverId } from "../domain/driver-id";
import { DriverEntity } from "./driver.entity";
import { DriverMapper } from "./driver.mapper";

export interface DriverFilter {
  userId?: string;
  status?: string;
  onlineStatus?: string;
  fatigueLevel?: string;
}

@Injectable()
export class DriverRepository implements IRepository<Driver, DriverId> {
  constructor(
    @InjectRepository(DriverEntity)
    private readonly repository: TypeOrmRepo<DriverEntity>,
    private readonly mapper: DriverMapper,
  ) {}

  async save(aggregate: Driver): Promise<void> {
    const entity = this.mapper.toPersistence(aggregate);
    await this.repository.save(entity);
  }

  async findById(id: DriverId): Promise<Driver | null> {
    const entity = await this.repository.findOne({
      where: { id: id.toString() },
    });
    if (!entity) return null;
    return this.mapper.toDomain(entity);
  }

  async findByIdOrFail(id: DriverId): Promise<Driver> {
    const driver = await this.findById(id);
    if (!driver) {
      throw new EntityNotFoundError("Driver", id.toString());
    }
    return driver;
  }

  async exists(id: DriverId): Promise<boolean> {
    const count = await this.repository.count({
      where: { id: id.toString() },
    });
    return count > 0;
  }

  async delete(aggregate: Driver): Promise<void> {
    await this.repository.delete({ id: aggregate.id.toString() });
  }

  async deleteById(id: DriverId): Promise<void> {
    await this.repository.delete({ id: id.toString() });
  }

  async findByUserId(userId: string): Promise<Driver | null> {
    const entity = await this.repository.findOne({ where: { userId } });
    if (!entity) return null;
    return this.mapper.toDomain(entity);
  }

  async findAll(filter?: DriverFilter): Promise<Driver[]> {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.onlineStatus) where.onlineStatus = filter.onlineStatus;
    if (filter?.fatigueLevel) where.fatigueLevel = filter.fatigueLevel;

    const entities = await this.repository.find({ where });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async findOne(criteria: Record<string, unknown>): Promise<Driver | null> {
    const entity = await this.repository.findOne({ where: criteria as any });
    if (!entity) return null;
    return this.mapper.toDomain(entity);
  }

  async findAvailableDrivers(): Promise<Driver[]> {
    const entities = await this.repository.find({
      where: {
        status: DriverStatus.ACTIVE,
        onlineStatus: DriverOnlineStatus.ONLINE,
        currentOrderId: IsNull(),
      },
    });
    return entities
      .map((e) => this.mapper.toDomain(e))
      .filter((d) => d.isAvailable);
  }

  async count(filter?: DriverFilter): Promise<number> {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.onlineStatus) where.onlineStatus = filter.onlineStatus;
    return this.repository.count({ where });
  }
}
