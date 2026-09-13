import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EntityNotFoundError } from "@mythfood/shared-kernel";
import { Dispatch } from "../domain/dispatch.aggregate";
import { DispatchId } from "../domain/dispatch-id";
import { DispatchEntity } from "./dispatch.entity";
import { DispatchMapper } from "./dispatch.mapper";

@Injectable()
export class DispatchRepository {
  constructor(
    @InjectRepository(DispatchEntity)
    private readonly repo: Repository<DispatchEntity>,
  ) {}

  async save(dispatch: Dispatch): Promise<void> {
    const entity = DispatchMapper.toPersistence(dispatch);
    await this.repo.save(entity);
  }

  async findById(id: DispatchId): Promise<Dispatch | null> {
    const entity = await this.repo.findOne({ where: { id: id.value } });
    if (!entity) return null;
    return DispatchMapper.toDomain(entity);
  }

  async findByIdOrFail(id: DispatchId): Promise<Dispatch> {
    const dispatch = await this.findById(id);
    if (!dispatch) {
      throw new EntityNotFoundError("Dispatch", id.value);
    }
    return dispatch;
  }

  async findByOrderId(orderId: string): Promise<Dispatch | null> {
    const entity = await this.repo.findOne({ where: { orderId } });
    if (!entity) return null;
    return DispatchMapper.toDomain(entity);
  }

  async findByDriverId(driverId: string): Promise<Dispatch[]> {
    const entities = await this.repo.find({
      where: { driverId },
      order: { createdAt: "DESC" },
    });
    return entities.map(DispatchMapper.toDomain);
  }

  async findByMerchantId(merchantId: string): Promise<Dispatch[]> {
    const entities = await this.repo.find({
      where: { merchantId },
      order: { createdAt: "DESC" },
    });
    return entities.map(DispatchMapper.toDomain);
  }

  async findAll(filter?: {
    status?: string;
    driverId?: string;
    orderId?: string;
    skip?: number;
    take?: number;
  }): Promise<Dispatch[]> {
    const where: Record<string, unknown> = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.driverId) where.driverId = filter.driverId;
    if (filter?.orderId) where.orderId = filter.orderId;

    const entities = await this.repo.find({
      where,
      order: { createdAt: "DESC" },
      skip: filter?.skip,
      take: filter?.take,
    });
    return entities.map(DispatchMapper.toDomain);
  }

  async findActiveDispatches(): Promise<Dispatch[]> {
    const entities = await this.repo
      .createQueryBuilder("d")
      .where("d.status NOT IN (:...terminalStatuses)", {
        terminalStatuses: ["DELIVERED", "EXPIRED", "CANCELLED"],
      })
      .orderBy("d.createdAt", "DESC")
      .getMany();
    return entities.map(DispatchMapper.toDomain);
  }

  async findMatchingDispatches(): Promise<Dispatch[]> {
    const entities = await this.repo.find({
      where: { status: "MATCHING" },
      order: { createdAt: "ASC" },
    });
    return entities.map(DispatchMapper.toDomain);
  }

  /** Dispatches stuck in DRIVER_ASSIGNED (driver hasn't responded) older than cutoff. */
  async findAssignedOlderThan(cutoff: Date): Promise<Dispatch[]> {
    const entities = await this.repo
      .createQueryBuilder("d")
      .where("d.status = :status", { status: "DRIVER_ASSIGNED" })
      .andWhere("d.updatedAt < :cutoff", { cutoff })
      .orderBy("d.updatedAt", "ASC")
      .getMany();
    return entities.map(DispatchMapper.toDomain);
  }

  async deleteById(id: DispatchId): Promise<void> {
    await this.repo.delete({ id: id.value });
  }

  // ═══════════════════════════════════════════════════════
  // Matching Engine Queries
  // ═══════════════════════════════════════════════════════

  async findAvailableDriversNearLocation(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<
    {
      driverId: string;
      distanceKm: number;
      latitude: number;
      longitude: number;
    }[]
  > {
    // Lấy danh sách tài xế khả dụng từ driver-service (HTTP) — không query xuyên DB
    const driverUrl =
      process.env.DRIVER_SERVICE_URL || "http://driver-service:3007";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";

    try {
      const res = await fetch(`${driverUrl}/api/v1/drivers/available/list`, {
        headers: { "x-service-key": serviceKey },
      });
      if (!res.ok) return [];
      const json: any = await res.json();
      const drivers: any[] = json?.data ?? json ?? [];

      const results: {
        driverId: string;
        distanceKm: number;
        latitude: number;
        longitude: number;
      }[] = [];
      for (const d of drivers) {
        const dLat = Number(d.currentLatitude);
        const dLng = Number(d.currentLongitude);
        if (dLat == null || dLng == null || isNaN(dLat) || isNaN(dLng))
          continue;
        if (d.currentOrderId) continue; // đã lọc ở driver-service, kiểm tra lại cho chắc
        const distanceKm = this._haversine(lat, lng, dLat, dLng);
        if (radiusKm < 9999 && distanceKm > radiusKm) continue;
        results.push({
          driverId: d.id,
          distanceKm,
          latitude: dLat,
          longitude: dLng,
        });
      }
      results.sort((a, b) => a.distanceKm - b.distanceKm);
      return results.slice(0, 20);
    } catch {
      return [];
    }
  }

  private _haversine(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
