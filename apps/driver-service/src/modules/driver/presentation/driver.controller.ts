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
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../../auth/service-key-or-jwt.guard";
import { DriverService } from "../application/driver.service";
import {
  CreateDriverDto,
  UpdateDriverProfileDto,
  UpdateLocationDto,
  UpdateFatigueDto,
  RateDriverDto,
  PenalizeCancellationDto,
  DriverComplianceDto,
  AssignOrderDto,
  ReleaseOrderDto,
  CompleteOrderDto,
} from "../application/dtos/driver.dto";

@Controller("drivers")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  // ---- CRUD ----

  @Post()
  @Roles("DRIVER", "ADMIN")
  async create(@Body() dto: CreateDriverDto) {
    const driver = await this.driverService.createDriver(dto);
    return { statusCode: HttpStatus.CREATED, data: this.toResponse(driver) };
  }

  @Get()
  @Roles("ADMIN")
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
  async getAvailable(@Query("includeStackable") includeStackable?: string) {
    const drivers = await this.driverService.getAvailableDrivers(
      includeStackable === "true",
    );
    return {
      statusCode: HttpStatus.OK,
      data: drivers.map((d) => this.toResponse(d)),
    };
  }

  @Get("user/:userId")
  @Roles("DRIVER", "ADMIN")
  async getByUserId(@Param("userId") userId: string) {
    const driver = await this.driverService.getByUserId(userId);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch("user/:userId/status")
  @Roles("ADMIN")
  async updateStatusByUserId(
    @Param("userId") userId: string,
    @Body() body: { status: string; reason?: string; durationDays?: number },
  ) {
    const driver = await this.driverService.setStatusByUserId(
      userId,
      body.status,
      { reason: body.reason, durationDays: body.durationDays },
    );
    return {
      statusCode: HttpStatus.OK,
      data: driver ? this.toResponse(driver) : null,
    };
  }

  @Get(":id")
  @Roles("DRIVER", "ADMIN")
  async getById(@Param("id") id: string) {
    const driver = await this.driverService.getById(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Put(":id")
  @Roles("DRIVER", "ADMIN")
  async updateProfile(
    @Param("id") id: string,
    @Body() dto: UpdateDriverProfileDto,
  ) {
    const driver = await this.driverService.updateProfile(id, dto);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string) {
    await this.driverService.deleteDriver(id);
  }

  // ---- Training & Activation ----

  @Patch(":id/complete-training")
  @Roles("ADMIN")
  async completeTraining(@Param("id") id: string) {
    const driver = await this.driverService.completeTraining(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/activate")
  @Roles("ADMIN")
  async activate(@Param("id") id: string) {
    const driver = await this.driverService.activateDriver(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/deactivate")
  @Roles("ADMIN")
  async deactivate(@Param("id") id: string) {
    const driver = await this.driverService.deactivateDriver(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/suspend")
  @Roles("ADMIN")
  async suspend(
    @Param("id") id: string,
    @Body() body: { durationDays?: number; reason?: string },
  ) {
    const driver = await this.driverService.suspendDriver(
      id,
      body.durationDays,
      body.reason,
    );
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  /** Từ chối hồ sơ tài xế (kèm lý do hiển thị khi đăng nhập). */
  @Patch(":id/reject")
  @Roles("ADMIN")
  async reject(
    @Param("id") id: string,
    @Body() body: { reason?: string } = {},
  ) {
    const driver = await this.driverService.rejectDriver(id, body?.reason);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/unlock")
  @Roles("ADMIN")
  async unlock(@Param("id") id: string) {
    const driver = await this.driverService.unlockDriver(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Online/Offline ----

  @Patch(":id/go-online")
  @Roles("DRIVER", "ADMIN")
  async goOnline(@Param("id") id: string) {
    const driver = await this.driverService.goOnline(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/go-offline")
  @Roles("DRIVER", "ADMIN")
  async goOffline(@Param("id") id: string) {
    const driver = await this.driverService.goOffline(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/go-home")
  @Roles("DRIVER", "ADMIN")
  async goHome(@Param("id") id: string) {
    const driver = await this.driverService.goHome(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- GPS Location ----

  @Patch(":id/location")
  @Roles("DRIVER", "ADMIN")
  async updateLocation(
    @Param("id") id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    const driver = await this.driverService.updateLocation(id, dto);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Get(":id/location/history")
  @Roles("DRIVER", "ADMIN")
  async getLocationHistory(
    @Param("id") id: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : 200;
    const safeLimit = Number.isNaN(parsed)
      ? 200
      : Math.min(1000, Math.max(1, parsed));
    const history = await this.driverService.getLocationHistory(id, safeLimit);
    return { statusCode: HttpStatus.OK, data: history };
  }

  // ---- Order Assignment ----

  @Patch(":id/assign-order")
  @Roles("DRIVER", "ADMIN")
  async assignOrder(@Param("id") id: string, @Body() dto: AssignOrderDto) {
    const driver = await this.driverService.assignOrder(
      id,
      dto.orderId,
      dto.maxConcurrentOrders,
    );
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/complete-order")
  @Roles("DRIVER", "ADMIN")
  async completeOrder(@Param("id") id: string, @Body() dto?: CompleteOrderDto) {
    const driver = await this.driverService.completeOrder(id, dto?.orderId);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/release-order")
  @Roles("DRIVER", "ADMIN")
  async releaseOrder(@Param("id") id: string, @Body() dto?: ReleaseOrderDto) {
    const driver = await this.driverService.releaseOrder(id, dto?.orderId);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  /** Danh sách đơn đang giữ — driver-app dùng để hiển thị lộ trình gộp. */
  @Get(":id/active-orders")
  @Roles("DRIVER", "ADMIN")
  async getActiveOrders(@Param("id") id: string) {
    const driver = await this.driverService.getById(id);
    return {
      statusCode: HttpStatus.OK,
      data: {
        driverId: driver.id.toString(),
        orderIds: driver.driverCurrentOrderIds,
        maxConcurrentOrders: driver.driverMaxConcurrentOrders,
        activeCount: driver.driverActiveOrderCount,
      },
    };
  }

  // ---- Fatigue ----

  @Patch(":id/fatigue")
  @Roles("DRIVER", "ADMIN")
  async updateFatigue(@Param("id") id: string, @Body() dto: UpdateFatigueDto) {
    const driver = await this.driverService.updateFatigue(id, dto);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/take-break")
  @Roles("DRIVER", "ADMIN")
  async takeBreak(@Param("id") id: string) {
    const driver = await this.driverService.takeBreak(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/force-break")
  @Roles("ADMIN")
  async forceBreak(@Param("id") id: string) {
    const driver = await this.driverService.forceBreak(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Shift ----

  @Patch(":id/start-shift")
  @Roles("DRIVER", "ADMIN")
  async startShift(@Param("id") id: string) {
    const driver = await this.driverService.startShift(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/end-shift")
  @Roles("DRIVER", "ADMIN")
  async endShift(@Param("id") id: string) {
    const driver = await this.driverService.endShift(id);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Earnings & Stats (B4) ----

  @Get("stats")
  @Roles("ADMIN")
  async getDriverStats() {
    const stats = await this.driverService.getDriverStats();
    return { statusCode: HttpStatus.OK, data: stats };
  }

  @Get(":id/earnings")
  @Roles("DRIVER", "ADMIN")
  async getEarnings(@Param("id") id: string, @Query("period") period?: string) {
    const earnings = await this.driverService.getEarnings(
      id,
      period || "today",
    );
    return { statusCode: HttpStatus.OK, data: earnings };
  }

  // ---- Rating (Bổ sung: đánh giá tài xế) ----

  @Patch(":id/rating")
  @Roles("ADMIN", "DRIVER")
  async rateDriver(@Param("id") id: string, @Body() dto: RateDriverDto) {
    const driver = await this.driverService.rateDriver(id, dto);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  @Patch(":id/penalize-cancellation")
  @Roles("ADMIN")
  async penalizeCancellation(
    @Param("id") id: string,
    @Body() dto: PenalizeCancellationDto,
  ) {
    const driver = await this.driverService.penalizeCancellation(
      id,
      dto.blockMinutes ?? 30,
    );
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Compliance (resolution-service) ----
  @Patch(":id/compliance")
  @Roles("ADMIN")
  async compliance(@Param("id") id: string, @Body() dto: DriverComplianceDto) {
    const driver = await this.driverService.applyCompliance(id, dto);
    return { statusCode: HttpStatus.OK, data: this.toResponse(driver) };
  }

  // ---- Public profile (cho CONSUMER xem thông tin tài xế khi có đơn) ----

  @Get(":id/public-profile")
  @Roles("CONSUMER", "DRIVER", "MERCHANT_OWNER", "ADMIN")
  async getPublicProfile(@Param("id") id: string) {
    const driver = await this.driverService.getById(id);
    return { statusCode: HttpStatus.OK, data: this.toPublicProfile(driver) };
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
      vehicleType: driver.driverVehicleType ?? driver._vehicleType ?? null,
      insuranceNumber: driver.driverInsuranceNumber ?? driver._insuranceNumber,
      status: driver.driverStatus ?? driver._status,
      rejectedAt: driver.driverRejectedAt ?? driver._rejectedAt ?? null,
      rejectReason: driver.driverRejectReason ?? driver._rejectReason ?? null,
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
      totalRatings: driver.driverTotalRatings ?? driver._totalRatings,
      reputationScore: driver.driverReputationScore ?? driver._reputationScore,
      acceptBlockedUntil:
        driver.driverAcceptBlockedUntil ?? driver._acceptBlockedUntil,
      currentOrderId: driver.driverCurrentOrderId ?? driver._currentOrderId,
      currentOrderIds:
        driver.driverCurrentOrderIds ??
        (driver.driverCurrentOrderId ? [driver.driverCurrentOrderId] : []),
      maxConcurrentOrders:
        driver.driverMaxConcurrentOrders ?? driver._maxConcurrentOrders ?? 1,
      activeOrderCount:
        driver.driverActiveOrderCount ??
        driver.driverCurrentOrderIds?.length ??
        0,
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

  private toPublicProfile(driver: any) {
    return {
      id: driver.id?.toString?.() ?? driver.id,
      userId: driver.driverUserId ?? driver._userId,
      fullName: driver.driverFullName ?? driver._fullName,
      avatar: driver.driverAvatar ?? driver._avatar,
      vehicleRegistrationNumber:
        driver.driverVehicleRegistrationNumber ??
        driver._vehicleRegistrationNumber,
      rating: driver.driverRating ?? driver._rating,
      totalRatings: driver.driverTotalRatings ?? driver._totalRatings,
    };
  }
}
