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

  /**
   * Vết GPS **theo đơn/khoảng thời gian** — dùng cho điều tra khiếu nại.
   *
   * Khác `findByDriver`: lấy `limit` điểm **mới nhất** trong cửa sổ rồi đảo
   * tăng dần, để không bị cắt mất đoạn đường tới lúc giao hàng khi tài xế đã
   * có nhiều điểm GPS của các đơn trước đó.
   */
  async findByDriverForOrder(
    driverId: string,
    options: {
      orderId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
    } = {},
  ): Promise<DriverLocationPoint[]> {
    const qb = this.repository
      .createQueryBuilder("p")
      .where("p.driverId = :driverId", { driverId });
    if (options.orderId) {
      qb.andWhere("p.orderId = :orderId", { orderId: options.orderId });
    }
    if (options.from) {
      qb.andWhere("p.recordedAt >= :from", { from: options.from });
    }
    if (options.to) {
      qb.andWhere("p.recordedAt <= :to", { to: options.to });
    }
    const limit = Math.min(1000, Math.max(1, options.limit ?? 200));
    const rows = await qb.orderBy("p.recordedAt", "DESC").take(limit).getMany();
    return rows.reverse().map((r) => this.toPoint(r));
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
