import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";
import { DriverRepository } from "../infrastructure/driver.repository";
import { Driver } from "../domain/driver.aggregate";
import { DriverId } from "../domain/driver-id";
import {
  CreateDriverDto,
  UpdateDriverProfileDto,
  UpdateLocationDto,
  UpdateFatigueDto,
  RateDriverDto,
} from "./dtos/driver.dto";

@Injectable()
export class DriverService {
  private readonly logger = new Logger(DriverService.name);

  constructor(
    private readonly driverRepo: DriverRepository,
    private readonly httpService: HttpService,
  ) {}

  // ---- Driver Profile CRUD ----

  async createDriver(dto: CreateDriverDto): Promise<Driver> {
    const existing = await this.driverRepo.findByUserId(dto.userId);
    if (existing) {
      throw new BusinessRuleViolationError(
        "Driver profile already exists for this user",
      );
    }
    const driver = Driver.create(dto);
    await this.driverRepo.save(driver);
    return driver;
  }

  async getById(id: string): Promise<Driver> {
    const driverId = DriverId.from(id);
    return this.driverRepo.findByIdOrFail(driverId);
  }

  async getByUserId(userId: string): Promise<Driver | null> {
    return this.driverRepo.findByUserId(userId);
  }

  async getAll(filter?: {
    status?: string;
    onlineStatus?: string;
    fatigueLevel?: string;
  }): Promise<Driver[]> {
    return this.driverRepo.findAll(filter);
  }

  async getAvailableDrivers(): Promise<Driver[]> {
    return this.driverRepo.findAvailableDrivers();
  }

  async updateProfile(
    id: string,
    dto: UpdateDriverProfileDto,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.updateProfile(dto);
    await this.driverRepo.save(driver);
    return driver;
  }

  async deleteDriver(id: string): Promise<void> {
    const driverId = DriverId.from(id);
    await this.driverRepo.deleteById(driverId);
  }

  // ---- Training & Activation ----

  async completeTraining(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.completeTraining();
    await this.driverRepo.save(driver);
    return driver;
  }

  async activateDriver(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.activate();
    await this.driverRepo.save(driver);
    return driver;
  }

  async deactivateDriver(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.deactivate();
    await this.driverRepo.save(driver);
    return driver;
  }

  async suspendDriver(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.suspend();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Online/Offline Status ----

  async goOnline(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.goOnline();
    await this.driverRepo.save(driver);
    return driver;
  }

  async goOffline(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.goOffline();
    await this.driverRepo.save(driver);
    return driver;
  }

  async goHome(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.goHome();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- GPS Real-time Location ----

  async updateLocation(id: string, dto: UpdateLocationDto): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.updateLocation(dto.latitude, dto.longitude);
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Order Assignment ----

  async assignOrder(id: string, orderId: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.assignOrder(orderId);
    await this.driverRepo.save(driver);
    return driver;
  }

  async completeOrder(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.completeOrder();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Rating (called by review-service to keep driver rating in sync) ----
  async rateDriver(id: string, dto: RateDriverDto): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.addRating(dto.rating);
    await this.driverRepo.save(driver);
    return driver;
  }

  /**
   * Phạt tài xế (Case 7): giảm điểm uy tín + tạm khóa nhận đơn trong `blockMinutes`.
   */
  async penalizeCancellation(
    id: string,
    blockMinutes: number,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.penalizeCancellation(blockMinutes);
    await this.driverRepo.save(driver);
    return driver;
  }

  /**
   * Giải phóng tài xế khỏi đơn hiện tại (khi hủy/giao thất bại).
   */
  async releaseOrder(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.releaseOrder();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Fatigue Management ----

  async updateFatigue(id: string, dto: UpdateFatigueDto): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.updateFatigueStatus(dto.minutesSinceLastCheck);
    await this.driverRepo.save(driver);
    return driver;
  }

  async takeBreak(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.takeBreak();
    await this.driverRepo.save(driver);
    return driver;
  }

  async forceBreak(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.forceBreak();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Shift Management ----

  async startShift(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.startShift();
    await this.driverRepo.save(driver);
    return driver;
  }

  async endShift(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.endShift();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Earnings (B4): delegate to wallet-service ----
  async getEarnings(id: string, period: string): Promise<any> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    const walletEarnings = await this.fetchWalletEarnings(
      driver.id.toString(),
      period,
    );
    const totalOrders =
      walletEarnings?.totalOrders ?? driver.driverTotalOrders ?? 0;
    const totalEarnings = walletEarnings?.totalEarnings ?? 0;
    return {
      driverId: driver.id.toString(),
      period,
      totalEarnings,
      totalOrders,
      averagePerOrder:
        totalOrders > 0
          ? Math.round((totalEarnings / totalOrders) * 100) / 100
          : 0,
      earningsByDay: walletEarnings?.earningsByDay ?? [],
    };
  }

  private async fetchWalletEarnings(
    driverId: string,
    period: string,
  ): Promise<any | null> {
    const url = process.env.WALLET_SERVICE_URL || "http://localhost:3009";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${url}/api/v1/wallets/earnings`, {
          params: { ownerId: driverId, ownerType: "DRIVER", period },
          headers: { "x-service-key": serviceKey },
        }),
      );
      return res.data;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch wallet earnings: ${err?.message}`);
      return null;
    }
  }

  // ---- Stats (B4) ----
  async getDriverStats(): Promise<any> {
    const all = await this.driverRepo.findAll({});
    return {
      totalDrivers: all.length,
      activeDrivers: all.filter((d) => d.driverStatus === "ACTIVE").length,
      onlineDrivers: all.filter((d) => d.driverOnlineStatus === "ONLINE")
        .length,
    };
  }
}
