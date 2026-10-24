import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { v4 as uuidv4 } from "uuid";
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

  /**
   * Ghi nhiều điểm GPS trong **1 INSERT** — dùng cho lô gửi từ app tài xế.
   *
   * Dùng `INSERT ... SELECT UNNEST(...)` thay vì `repository.save(rows)` vì cột
   * `recordedAt` là `@CreateDateColumn`: TypeORM có thể tự ghi đè thời điểm insert,
   * trong khi yêu cầu ở đây là **giữ nguyên thời điểm thiết bị ghi nhận** (điểm
   * gửi bù sau khi mất mạng). `id` được sinh ở client để không phụ thuộc default
   * của DB.
   */
  async savePoints(
    inputs: {
      driverId: string;
      orderId?: string | null;
      latitude: number;
      longitude: number;
      recordedAt?: Date;
    }[],
  ): Promise<number> {
    if (inputs.length === 0) return 0;

    const ids = inputs.map(() => uuidv4());
    const driverIds = inputs.map((input) => input.driverId);
    const orderIds = inputs.map((input) => input.orderId ?? null);
    const latitudes = inputs.map((input) => input.latitude);
    const longitudes = inputs.map((input) => input.longitude);
    const recordedAts = inputs.map((input) =>
      input.recordedAt ? input.recordedAt.toISOString() : null,
    );

    await this.repository.query(
      `INSERT INTO driver_location_history
         ("id", "driverId", "orderId", "latitude", "longitude", "recordedAt")
       SELECT * FROM UNNEST(
         $1::uuid[], $2::uuid[], $3::uuid[],
         $4::numeric[], $5::numeric[], $6::timestamptz[]
       )`,
      [ids, driverIds, orderIds, latitudes, longitudes, recordedAts],
    );

    return inputs.length;
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
