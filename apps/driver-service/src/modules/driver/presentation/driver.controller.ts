import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { DriverService } from "../application/driver.service";
import {
  CreateDriverDto,
  UpdateDriverProfileDto,
  UpdateLocationDto,
  UpdateFatigueDto,
} from "../application/dtos/driver.dto";

@Controller("api/v1/drivers")
@UseGuards(AuthGuard("jwt"))
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  // ---- CRUD ----

  @Post()
  async create(@Body() dto: CreateDriverDto) {
    const driver = await this.driverService.createDriver(dto);
    return { statusCode: HttpStatus.CREATED, data: this.toResponse(driver) };
  }

  @Get()
  async getAll(
    @Query("status") status?: string,
    @Query("onlineStatus") onlineStatus?: string,
    @Query("fatigueLevel") fatigueLevel?: string,
  ) {
    const drivers = await this.driverService.getAll({
      status,
      onlineStatus,
      fatigueLevel,
    });
    return {
      statusCode: HttpStatus.OK,
      data: drivers.map((d) => this.toResponse(d)),
    };
  }

  @Get("available/list")
  async getAvailable() {
    const drivers = await this.driverService.getAvailableDrivers();
    return {
      statusCode: HttpStatus.OK,
      data: drivers.map((d) => this.toResponse(d)),
    };
  }

  @Get("user/:userId")
  async getByUserId(@Param("userId") userId: string) {
    const driver = await this.driverService.getByUserId(userId);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    const driver = await this.driverService.getById(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Put(":id")
  async updateProfile(
    @Param("id") id: string,
    @Body() dto: UpdateDriverProfileDto,
  ) {
    const driver = await this.driverService.updateProfile(id, dto);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string) {
    await this.driverService.deleteDriver(id);
  }

  // ---- Training & Activation ----

  @Patch(":id/complete-training")
  async completeTraining(@Param("id") id: string) {
    const driver = await this.driverService.completeTraining(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/activate")
  async activate(@Param("id") id: string) {
    const driver = await this.driverService.activateDriver(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/deactivate")
  async deactivate(@Param("id") id: string) {
    const driver = await this.driverService.deactivateDriver(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/suspend")
  async suspend(@Param("id") id: string) {
    const driver = await this.driverService.suspendDriver(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Online/Offline ----

  @Patch(":id/go-online")
  async goOnline(@Param("id") id: string) {
    const driver = await this.driverService.goOnline(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/go-offline")
  async goOffline(@Param("id") id: string) {
    const driver = await this.driverService.goOffline(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/go-home")
  async goHome(@Param("id") id: string) {
    const driver = await this.driverService.goHome(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- GPS Location ----

  @Patch(":id/location")
  async updateLocation(
    @Param("id") id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    const driver = await this.driverService.updateLocation(id, dto);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Order Assignment ----

  @Patch(":id/assign-order")
  async assignOrder(@Param("id") id: string, @Body("orderId") orderId: string) {
    const driver = await this.driverService.assignOrder(id, orderId);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/complete-order")
  async completeOrder(@Param("id") id: string) {
    const driver = await this.driverService.completeOrder(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Fatigue ----

  @Patch(":id/fatigue")
  async updateFatigue(@Param("id") id: string, @Body() dto: UpdateFatigueDto) {
    const driver = await this.driverService.updateFatigue(id, dto);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/take-break")
  async takeBreak(@Param("id") id: string) {
    const driver = await this.driverService.takeBreak(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/force-break")
  async forceBreak(@Param("id") id: string) {
    const driver = await this.driverService.forceBreak(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Shift ----

  @Patch(":id/start-shift")
  async startShift(@Param("id") id: string) {
    const driver = await this.driverService.startShift(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/end-shift")
  async endShift(@Param("id") id: string) {
    const driver = await this.driverService.endShift(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Helper ----

  private toResponse(driver: any) {
    return {
      id: driver.id?.toString?.() ?? driver.id,
      userId: driver.driverUserId ?? driver._userId,
      fullName: driver.driverFullName ?? driver._fullName,
      phoneNumber: driver.driverPhoneNumber ?? driver._phoneNumber,
      email: driver.driverEmail ?? driver._email,
      avatar: driver.driverAvatar ?? driver._avatar,
      idCardNumber: driver.driverIdCardNumber ?? driver._idCardNumber,
      driverLicenseNumber:
        driver.driverLicenseNumber ?? driver._driverLicenseNumber,
      vehicleRegistrationNumber:
        driver.driverVehicleRegistrationNumber ??
        driver._vehicleRegistrationNumber,
      insuranceNumber: driver.driverInsuranceNumber ?? driver._insuranceNumber,
      status: driver.driverStatus ?? driver._status,
      onlineStatus: driver.driverOnlineStatus ?? driver._onlineStatus,
      currentLatitude: driver.driverCurrentLatitude ?? driver._currentLatitude,
      currentLongitude:
        driver.driverCurrentLongitude ?? driver._currentLongitude,
      lastLocationUpdateAt:
        driver.driverLastLocationUpdateAt ?? driver._lastLocationUpdateAt,
      totalDrivingMinutesToday:
        driver.driverTotalDrivingMinutesToday ??
        driver._totalDrivingMinutesToday,
      consecutiveDrivingMinutes:
        driver.driverConsecutiveDrivingMinutes ??
        driver._consecutiveDrivingMinutes,
      fatigueLevel: driver.driverFatigueLevel ?? driver._fatigueLevel,
      goHomeCountToday:
        driver.driverGoHomeCountToday ?? driver._goHomeCountToday,
      totalOrders: driver.driverTotalOrders ?? driver._totalOrders,
      rating: driver.driverRating ?? driver._rating,
      currentOrderId: driver.driverCurrentOrderId ?? driver._currentOrderId,
      isTrainingCompleted:
        driver.driverIsTrainingCompleted ?? driver._isTrainingCompleted,
      depositAmount: driver.driverDepositAmount ?? driver._depositAmount,
      creditWalletBalance:
        driver.driverCreditWalletBalance ?? driver._creditWalletBalance,
      incomeWalletBalance:
        driver.driverIncomeWalletBalance ?? driver._incomeWalletBalance,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
    };
  }
}
