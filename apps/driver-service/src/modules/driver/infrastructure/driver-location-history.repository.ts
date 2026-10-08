import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { DriverLocationHistoryEntity } from "./driver-location-history.entity";

export interface DriverLocationPoint {
  id: string;
  driverId: string;
  orderId: string | null;
  latitude: number;
  longitude: number;
  recordedAt: Date;
}

@Injectable()
export class DriverLocationHistoryRepository {
  constructor(
    @InjectRepository(DriverLocationHistoryEntity)
    private readonly repository: TypeOrmRepo<DriverLocationHistoryEntity>,
  ) {}

  async savePoint(input: {
    driverId: string;
    orderId?: string | null;
    latitude: number;
    longitude: number;
  }): Promise<DriverLocationPoint> {
    const entity = this.repository.create({
      driverId: input.driverId,
      orderId: input.orderId ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    const saved = await this.repository.save(entity);
    return this.toPoint(saved);
  }

  async findByDriver(
    driverId: string,
    limit = 200,
  ): Promise<DriverLocationPoint[]> {
    const rows = await this.repository.find({
      where: { driverId },
      order: { recordedAt: "ASC" },
      take: limit,
    });
    return rows.map((r) => this.toPoint(r));
  }

  private toPoint(r: DriverLocationHistoryEntity): DriverLocationPoint {
    return {
      id: r.id,
      driverId: r.driverId,
      orderId: r.orderId,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      recordedAt: r.recordedAt,
    };
  }
}
