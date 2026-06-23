import { Injectable } from "@nestjs/common";
import {
  BusinessRuleViolationError,
  EntityNotFoundError,
} from "@mythfood/shared-kernel";
import { DriverRepository } from "../infrastructure/driver.repository";
import { Driver } from "../domain/driver.aggregate";
import { DriverId } from "../domain/driver-id";
import {
  CreateDriverDto,
  UpdateDriverProfileDto,
  UpdateLocationDto,
  UpdateFatigueDto,
} from "./dtos/driver.dto";

@Injectable()
export class DriverService {
  constructor(private readonly driverRepo: DriverRepository) {}

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

  async getByUserId(userId: string): Promise<Driver> {
    const driver = await this.driverRepo.findByUserId(userId);
    if (!driver) {
      throw new EntityNotFoundError("Driver", userId);
    }
    return driver;
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
}
