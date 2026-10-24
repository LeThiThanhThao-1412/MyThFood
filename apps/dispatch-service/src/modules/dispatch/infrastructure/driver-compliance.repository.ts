import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { v4 as uuid } from "uuid";
import {
  DriverDispatchOfferEntity,
  DriverDispatchOfferOutcome,
} from "./driver-dispatch-offer.entity";
import { DriverComplianceStateEntity } from "./driver-compliance-state.entity";

export interface DriverOfferStats {
  driverId: string;
  total: number;
  declined: number;
  noResponse: number;
}

@Injectable()
export class DriverComplianceRepository {
  constructor(
    @InjectRepository(DriverDispatchOfferEntity)
    private readonly offerRepo: TypeOrmRepo<DriverDispatchOfferEntity>,
    @InjectRepository(DriverComplianceStateEntity)
    private readonly stateRepo: TypeOrmRepo<DriverComplianceStateEntity>,
  ) {}

  /**
   * Ghi nhận tài xế được giao đơn. Idempotent theo (driver_id, dispatch_id):
   * một đơn chỉ được tính là 1 offer cho mỗi tài xế.
   */
  async recordOffer(
    driverId: string,
    dispatchId: string,
    orderId: string,
  ): Promise<void> {
    if (!driverId || !dispatchId || !orderId) return;
    await this.offerRepo.query(
      `INSERT INTO driver_dispatch_offers
         (id, driver_id, dispatch_id, order_id, outcome, offered_at, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'PENDING', NOW(), NOW(), NOW())
       ON CONFLICT (driver_id, dispatch_id) DO NOTHING`,
      [uuid(), driverId, dispatchId, orderId],
    );
  }

  /** Tài xế đã nhận đơn. */
  async markAccepted(
    driverId: string,
    dispatchId: string,
    orderId: string,
  ): Promise<void> {
    if (!driverId || !dispatchId || !orderId) return;
    await this.offerRepo.query(
      `INSERT INTO driver_dispatch_offers
         (id, driver_id, dispatch_id, order_id, outcome,
          offered_at, responded_at, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ACCEPTED',
               NOW(), NOW(), NOW(), NOW())
       ON CONFLICT (driver_id, dispatch_id) DO UPDATE
         SET outcome = 'ACCEPTED',
             responded_at = COALESCE(driver_dispatch_offers.responded_at, NOW()),
             updated_at = NOW()`,
      [uuid(), driverId, dispatchId, orderId],
    );
  }

  /**
   * Tài xế từ chối hoặc không phản hồi. Upsert để vẫn ghi nhận được trường hợp
   * chưa có offer (dispatch cũ trước khi bật tính năng).
   */
  async markDeclined(
    driverId: string,
    dispatchId: string,
    orderId: string,
    outcome: Extract<DriverDispatchOfferOutcome, "DECLINED" | "NO_RESPONSE">,
    reason?: string | null,
  ): Promise<void> {
    if (!driverId || !dispatchId || !orderId) return;
    await this.offerRepo.query(
      `INSERT INTO driver_dispatch_offers
         (id, driver_id, dispatch_id, order_id, outcome, decline_reason,
          offered_at, responded_at, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6,
               NOW(), NOW(), NOW(), NOW())
       ON CONFLICT (driver_id, dispatch_id) DO UPDATE
         SET outcome = EXCLUDED.outcome,
             decline_reason = EXCLUDED.decline_reason,
             responded_at = NOW(),
             updated_at = NOW()`,
      [uuid(), driverId, dispatchId, orderId, outcome, reason ?? null],
    );
  }

  /**
   * Danh sách orderId mà tài xế đã **chủ động từ chối**.
   *
   * Khác với `dispatches.matchedDriverIds` (gắn với 1 row dispatch và mất khi
   * dispatch bị xoá/tạo lại), bảng offer lưu theo `order_id` nên vẫn còn giá
   * trị sau khi dispatch cũ bị thay thế → dùng để không gợi ý/gộp lại đơn mà
   * tài xế vừa từ chối.
   */
  async findDeclinedOrderIds(driverId: string): Promise<string[]> {
    if (!driverId) return [];
    const rows: Array<{ order_id: string }> = await this.offerRepo.query(
      `SELECT DISTINCT order_id
         FROM driver_dispatch_offers
        WHERE driver_id = $1::uuid
          AND outcome = 'DECLINED'`,
      [driverId],
    );
    return (rows ?? []).map((r) => r.order_id).filter(Boolean);
  }

  /**
   * Danh sách driverId đã **chủ động từ chối** một đơn cụ thể.
   *
   * Dùng cho matching engine: khi dispatch bị xoá & tạo lại (matchedDriverIds
   * rỗng) thì lịch sử từ chối theo `order_id` vẫn còn → không ghép lại đơn đó
   * cho tài xế đã từ chối.
   */
  async findDeclinedDriverIds(orderId: string): Promise<string[]> {
    if (!orderId) return [];
    const rows: Array<{ driver_id: string }> = await this.offerRepo.query(
      `SELECT DISTINCT driver_id
         FROM driver_dispatch_offers
        WHERE order_id = $1::uuid
          AND outcome = 'DECLINED'`,
      [orderId],
    );
    return (rows ?? []).map((r) => r.driver_id).filter(Boolean);
  }

  /** Tổng hợp số offer / từ chối / không phản hồi theo tài xế trong cửa sổ. */
  async getStats(since: Date): Promise<DriverOfferStats[]> {
    const rows: Array<{
      driverId: string;
      total: string | number;
      declined: string | number;
      noResponse: string | number;
    }> = await this.offerRepo.query(
      `SELECT
         driver_id AS "driverId",
         COUNT(*)::int AS "total",
         COUNT(*) FILTER (WHERE outcome = 'DECLINED')::int AS "declined",
         COUNT(*) FILTER (WHERE outcome = 'NO_RESPONSE')::int AS "noResponse"
       FROM driver_dispatch_offers
       WHERE offered_at >= $1
         AND outcome <> 'PENDING'
       GROUP BY driver_id
       ORDER BY driver_id`,
      [since],
    );

    return rows.map((r) => ({
      driverId: r.driverId,
      total: Number(r.total),
      declined: Number(r.declined),
      noResponse: Number(r.noResponse),
    }));
  }

  async getState(
    driverId: string,
  ): Promise<DriverComplianceStateEntity | null> {
    return this.stateRepo.findOne({ where: { driver_id: driverId } });
  }

  async saveState(input: {
    driverId: string;
    complaintLevel: number;
    lastComplaintAt: Date;
    badRate: number;
  }): Promise<void> {
    let state = await this.getState(input.driverId);
    if (!state) {
      state = new DriverComplianceStateEntity();
      state.driver_id = input.driverId;
      state.complaint_level = 0;
      state.last_complaint_at = null;
      state.last_bad_rate = null;
    }
    state.complaint_level = input.complaintLevel;
    state.last_complaint_at = input.lastComplaintAt;
    state.last_bad_rate = input.badRate;
    await this.stateRepo.save(state);
  }
}
