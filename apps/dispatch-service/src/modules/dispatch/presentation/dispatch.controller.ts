import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { DispatchService } from "../application/dispatch.service";
import {
  CreateDispatchDto,
  UpdateDispatchNotesDto,
  AssignDriverDto,
  DriverDeclineDto,
  CancelDispatchDto,
  QueryDispatchDto,
} from "../application/dtos/dispatch.dto";

@Controller("dispatches")
@UseGuards(AuthGuard("jwt"))
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  // ---- Dispatch CRUD ----

  @Post()
  async createDispatch(@Body() dto: CreateDispatchDto) {
    const dispatch = await this.dispatchService.createDispatch(dto);
    return {
      statusCode: HttpStatus.CREATED,
      data: this._toResponse(dispatch),
    };
  }

  @Get()
  async listDispatches(@Query() query: QueryDispatchDto) {
    const dispatches = await this.dispatchService.getAll(query);
    return {
      statusCode: HttpStatus.OK,
      data: dispatches.map((d) => this._toResponse(d)),
      total: dispatches.length,
    };
  }

  @Get("active")
  async listActive() {
    const dispatches = await this.dispatchService.getActiveDispatches();
    return {
      statusCode: HttpStatus.OK,
      data: dispatches.map((d) => this._toResponse(d)),
      total: dispatches.length,
    };
  }

  @Get("matching")
  async listMatching() {
    const dispatches = await this.dispatchService.getMatchingDispatches();
    return {
      statusCode: HttpStatus.OK,
      data: dispatches.map((d) => this._toResponse(d)),
      total: dispatches.length,
    };
  }

  // ---- Nearby (B3) ----
  @Get("nearby")
  async listNearby(
    @Query("latitude") latitude: string,
    @Query("longitude") longitude: string,
    @Query("radiusKm") radiusKm?: string,
  ) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radius = radiusKm ? parseFloat(radiusKm) : 5;

    if (isNaN(lat) || isNaN(lng)) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: "latitude and longitude are required",
      };
    }

    const dispatches = await this.dispatchService.getNearbyDispatches(lat, lng, radius);
    return {
      statusCode: HttpStatus.OK,
      data: {
        driverLocation: { latitude: lat, longitude: lng },
        nearbyDispatches: dispatches.map((d) => this._toResponse(d)),
        total: dispatches.length,
      },
    };
  }

  // ---- Location (B3) ----
  @Get(":id/location")
  async getDispatchLocation(@Param("id") id: string) {
    const location = await this.dispatchService.getDispatchLocation(id);
    return {
      statusCode: HttpStatus.OK,
      data: location,
    };
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    const dispatch = await this.dispatchService.getById(id);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Get("order/:orderId")
  async getByOrderId(@Param("orderId") orderId: string) {
    const dispatch = await this.dispatchService.getByOrderId(orderId);
    return {
      statusCode: HttpStatus.OK,
      data: dispatch ? this._toResponse(dispatch) : null,
    };
  }

  @Get("driver/:driverId")
  async getByDriverId(@Param("driverId") driverId: string) {
    const dispatches = await this.dispatchService.getByDriverId(driverId);
    return {
      statusCode: HttpStatus.OK,
      data: dispatches.map((d) => this._toResponse(d)),
      total: dispatches.length,
    };
  }

  @Get("merchant/:merchantId")
  async getByMerchantId(@Param("merchantId") merchantId: string) {
    const dispatches = await this.dispatchService.getByMerchantId(merchantId);
    return {
      statusCode: HttpStatus.OK,
      data: dispatches.map((d) => this._toResponse(d)),
      total: dispatches.length,
    };
  }

  @Put(":id/notes")
  async updateNotes(
    @Param("id") id: string,
    @Body() dto: UpdateDispatchNotesDto,
  ) {
    const dispatch = await this.dispatchService.updateNotes(id, dto);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDispatch(@Param("id") id: string) {
    await this.dispatchService.deleteDispatch(id);
  }

  // ---- Matching Engine ----

  @Patch(":id/assign-driver")
  async assignDriver(@Param("id") id: string, @Body() dto: AssignDriverDto) {
    const dispatch = await this.dispatchService.assignDriver(id, dto);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Patch(":id/driver-accept")
  async driverAccept(@Param("id") id: string) {
    const dispatch = await this.dispatchService.driverAccept(id);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Patch(":id/driver-decline")
  async driverDecline(@Param("id") id: string, @Body() dto: DriverDeclineDto) {
    const dispatch = await this.dispatchService.driverDecline(id, dto);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  // ---- Dispatch Lifecycle ----

  @Patch(":id/driver-arrived")
  async driverArrived(@Param("id") id: string) {
    const dispatch = await this.dispatchService.driverArrived(id);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Patch(":id/picked-up")
  async markPickedUp(@Param("id") id: string) {
    const dispatch = await this.dispatchService.markPickedUp(id);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Patch(":id/start-delivering")
  async startDelivering(@Param("id") id: string) {
    const dispatch = await this.dispatchService.startDelivering(id);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Patch(":id/delivered")
  async markDelivered(@Param("id") id: string) {
    const dispatch = await this.dispatchService.markDelivered(id);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Patch(":id/expire")
  async expireDispatch(@Param("id") id: string) {
    const dispatch = await this.dispatchService.expireDispatch(id);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  @Patch(":id/cancel")
  async cancelDispatch(
    @Param("id") id: string,
    @Body() dto: CancelDispatchDto,
  ) {
    const dispatch = await this.dispatchService.cancelDispatch(id, dto);
    return {
      statusCode: HttpStatus.OK,
      data: this._toResponse(dispatch),
    };
  }

  // ---- Helpers ----

  private _toResponse(dispatch: any) {
    return {
      id: dispatch.id.value,
      orderId: dispatch.dispatchOrderId,
      merchantId: dispatch.dispatchMerchantId,
      deliveryAddress: dispatch.dispatchDeliveryAddress,
      deliveryLatitude: dispatch.dispatchDeliveryLatitude,
      deliveryLongitude: dispatch.dispatchDeliveryLongitude,
      status: dispatch.dispatchStatus,
      driverId: dispatch.dispatchDriverId,
      matchedDriverIds: dispatch.dispatchMatchedDriverIds,
      retryCount: dispatch.dispatchRetryCount,
      declineReason: dispatch.dispatchDeclineReason,
      declineReasonType: dispatch.dispatchDeclineReasonType,
      pickedUpAt: dispatch.dispatchPickedUpAt,
      deliveredAt: dispatch.dispatchDeliveredAt,
      expiresAt: dispatch.dispatchExpiresAt,
      cancellationReason: dispatch.dispatchCancellationReason,
      notes: dispatch.dispatchNotes,
      isActive: dispatch.isActive,
      hasRemainingRetries: dispatch.hasRemainingRetries,
    };
  }
}
