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
  ): Promise<{ driverId: string; distanceKm: number; latitude: number; longitude: number }[]> {
    // Query all ONLINE drivers from driver-service DB (shared postgres)
    const result = await this.repo.query(
      `SELECT d.id as "driverId",
              d."currentLatitude" as latitude,
              d."currentLongitude" as longitude,
              (6371 * acos(
                cos(radians($1)) * cos(radians(d."currentLatitude")) *
                cos(radians(d."currentLongitude") - radians($2)) +
                sin(radians($1)) * sin(radians(d."currentLatitude"))
              )) as "distanceKm"
       FROM drivers d
       WHERE d.status = 'ACTIVE'
         AND d."onlineStatus" = 'ONLINE'
         AND d."fatigueLevel" != 'CRITICAL'
         AND d."currentOrderId" IS NULL
         AND d."currentLatitude" IS NOT NULL
         AND d."currentLongitude" IS NOT NULL
         ${radiusKm < 9999 ? 'AND (6371 * acos(cos(radians($1)) * cos(radians(d."currentLatitude")) * cos(radians(d."currentLongitude") - radians($2)) + sin(radians($1)) * sin(radians(d."currentLatitude")))) <= $3' : ''}
       ORDER BY "distanceKm" ASC
       LIMIT 20`,
      radiusKm < 9999 ? [lat, lng, radiusKm] : [lat, lng],
    );
    return result;
  }
}
