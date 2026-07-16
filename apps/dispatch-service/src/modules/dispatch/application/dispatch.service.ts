import { Injectable } from "@nestjs/common";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";
import { DispatchRepository } from "../infrastructure/dispatch.repository";
import { Dispatch, DispatchDeclineReason } from "../domain/dispatch.aggregate";
import { DispatchId } from "../domain/dispatch-id";
import {
  CreateDispatchDto,
  AssignDriverDto,
  DriverDeclineDto,
  CancelDispatchDto,
  UpdateDispatchNotesDto,
} from "./dtos/dispatch.dto";

@Injectable()
export class DispatchService {
  constructor(private readonly dispatchRepo: DispatchRepository) {}

  // ---- Dispatch CRUD ----

  async createDispatch(dto: CreateDispatchDto): Promise<Dispatch> {
    const existing = await this.dispatchRepo.findByOrderId(dto.orderId);
    if (existing) {
      throw new BusinessRuleViolationError(
        "Dispatch already exists for this order",
      );
    }
    const dispatch = Dispatch.create(dto);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async getById(id: string): Promise<Dispatch> {
    const dispatchId = DispatchId.from(id);
    return this.dispatchRepo.findByIdOrFail(dispatchId);
  }

  async getByOrderId(orderId: string): Promise<Dispatch | null> {
    return this.dispatchRepo.findByOrderId(orderId);
  }

  async getByDriverId(driverId: string): Promise<Dispatch[]> {
    return this.dispatchRepo.findByDriverId(driverId);
  }

  async getByMerchantId(merchantId: string): Promise<Dispatch[]> {
    return this.dispatchRepo.findByMerchantId(merchantId);
  }

  async getAll(filter?: {
    status?: string;
    driverId?: string;
    orderId?: string;
    skip?: number;
    take?: number;
  }): Promise<Dispatch[]> {
    return this.dispatchRepo.findAll(filter);
  }

  async getActiveDispatches(): Promise<Dispatch[]> {
    return this.dispatchRepo.findActiveDispatches();
  }

  async getMatchingDispatches(): Promise<Dispatch[]> {
    return this.dispatchRepo.findMatchingDispatches();
  }

  async updateNotes(
    id: string,
    dto: UpdateDispatchNotesDto,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.updateNotes(dto.notes);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async deleteDispatch(id: string): Promise<void> {
    const dispatchId = DispatchId.from(id);
    await this.dispatchRepo.deleteById(dispatchId);
  }

  // ---- Matching Engine ----

  async assignDriver(id: string, dto: AssignDriverDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.assignDriver(dto.driverId);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async driverAccept(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.driverAccept();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async driverDecline(id: string, dto: DriverDeclineDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.driverDecline(dto.reason, dto.detail);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  // ---- Dispatch Lifecycle ----

  async driverArrived(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.driverArrived();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async markPickedUp(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.markPickedUp();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async startDelivering(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.startDelivering();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async markDelivered(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.markDelivered();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async expireDispatch(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.expire();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async cancelDispatch(id: string, dto: CancelDispatchDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.cancel(dto.reason);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  // ---- Cron: Expire Stale Dispatches ----

  async expireStaleDispatches(): Promise<number> {
    const matchingDispatches = await this.dispatchRepo.findMatchingDispatches();
    const now = new Date();
    let expiredCount = 0;

    for (const dispatch of matchingDispatches) {
      const expiresAt = dispatch.dispatchExpiresAt;
      if (expiresAt && expiresAt < now && dispatch.isActive) {
        dispatch.expire();
        await this.dispatchRepo.save(dispatch);
        expiredCount++;
      }
    }

    return expiredCount;
  }
}
