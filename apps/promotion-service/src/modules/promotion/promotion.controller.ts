import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../auth/service-key-or-jwt.guard";
import { PromotionService } from "./promotion.service";
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  ValidatePromotionDto,
  ApplyPromotionDto,
  UpdateCompensationConfigDto,
  IssueCompensationVoucherDto,
  ApplyCompensationVoucherDto,
  CreateFlashSaleDto,
  UpdateFlashSaleDto,
  ValidateFlashSaleDto,
  ApplyFlashSaleDto,
  RefundFlashSaleDto,
  RefundFlashSaleItemsDto,
  RecalculateUsageDto,
} from "./promotion.dto";

@Controller("promotions")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Post()
  @Roles("MERCHANT_OWNER", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePromotionDto, @Req() req: any) {
    const roles: string[] = req?.user?.roles ?? [];
    const fundedBy = roles.includes("ADMIN") ? "PLATFORM" : "MERCHANT";
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.promotionService.create(dto, fundedBy),
    };
  }

  @Get()
  @Roles("ADMIN")
  async findAll(
    @Query("merchantId") merchantId?: string,
    @Query("isActive") isActive?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    const result = await this.promotionService.getAll({
      merchantId,
      isActive: isActive === undefined ? undefined : isActive === "true",
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Get("merchant/:merchantId")
  async getByMerchant(@Param("merchantId") merchantId: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.getByMerchantId(merchantId),
    };
  }

  @Get("merchant/:merchantId/stats")
  async getMerchantStats(@Param("merchantId") merchantId: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.getMerchantStats(merchantId),
    };
  }

  // ---- Compensation voucher (voucher bồi thường) ----

  @Get("compensation-config")
  @Roles("ADMIN")
  async getCompensationConfig() {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.getCompensationConfig(),
    };
  }

  @Patch("compensation-config")
  @Roles("ADMIN")
  async updateCompensationConfig(@Body() dto: UpdateCompensationConfigDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.updateCompensationConfig(dto),
    };
  }

  @Post("compensation-vouchers/issue")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async issueCompensationVoucher(@Body() dto: IssueCompensationVoucherDto) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.promotionService.issueCompensationVoucher(dto),
    };
  }

  @Get("compensation-vouchers/consumer/:consumerId")
  @Roles("CONSUMER", "ADMIN")
  async listCompensationVouchers(@Param("consumerId") consumerId: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.listCompensationVouchers(consumerId),
    };
  }

  @Post("compensation-vouchers/apply")
  @Roles("ADMIN")
  async applyCompensationVoucher(@Body() dto: ApplyCompensationVoucherDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.applyCompensationVoucher(dto),
    };
  }

  // ---- Flash Sale ----

  @Post("flash-sales")
  @Roles("MERCHANT_OWNER", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async createFlashSale(@Body() dto: CreateFlashSaleDto, @Req() req: any) {
    const roles: string[] = req?.user?.roles ?? [];
    const fundedBy = roles.includes("ADMIN") ? "PLATFORM" : "MERCHANT";
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.promotionService.createFlashSale(dto, fundedBy),
    };
  }

  @Get("flash-sales/active")
  async listActiveFlashSales() {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.listActiveFlashSales(),
    };
  }

  @Get("flash-sales/merchant/:merchantId")
  async listFlashSalesByMerchant(@Param("merchantId") merchantId: string) {
    const result = await this.promotionService.listFlashSales({ merchantId });
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Get("flash-sales")
  @Roles("ADMIN")
  async listFlashSales(
    @Query("merchantId") merchantId?: string,
    @Query("status") status?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    const result = await this.promotionService.listFlashSales({
      merchantId,
      status,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Get("flash-sales/:id")
  async getFlashSale(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.getFlashSaleById(id),
    };
  }

  @Get("flash-sales/:id/stats")
  async getFlashSaleStats(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.getFlashSaleStats(id),
    };
  }

  @Patch("flash-sales/:id")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async updateFlashSale(
    @Param("id") id: string,
    @Body() dto: UpdateFlashSaleDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.updateFlashSale(id, dto),
    };
  }

  @Post("flash-sales/:id/cancel")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async cancelFlashSale(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.cancelFlashSale(id),
    };
  }

  @Post("flash-sales/:id/pause")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async pauseFlashSale(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.pauseFlashSale(id),
    };
  }

  @Post("flash-sales/:id/resume")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async resumeFlashSale(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.resumeFlashSale(id),
    };
  }

  @Post("flash-sales/validate")
  async validateFlashSale(@Body() dto: ValidateFlashSaleDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.validateFlashSale(dto),
    };
  }

  @Post("flash-sales/apply")
  @Roles("CONSUMER", "ADMIN")
  async applyFlashSale(@Body() dto: ApplyFlashSaleDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.applyFlashSale(dto),
    };
  }

  @Post("flash-sales/refund")
  async refundFlashSale(@Body() dto: RefundFlashSaleDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.refundFlashSale(dto),
    };
  }

  @Post("flash-sales/refund-items")
  @Roles("ADMIN")
  async refundFlashSaleItems(@Body() dto: RefundFlashSaleItemsDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.refundFlashSaleItems(dto),
    };
  }

  /**
   * Tính lại discount của mã khuyến mãi sau khi đơn được chỉnh sửa món.
   * Order-service gọi bằng x-service-key (roles ADMIN) với dryRun để xem trước.
   */
  @Post("usages/recalculate")
  @Roles("ADMIN")
  async recalculateUsage(@Body() dto: RecalculateUsageDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.recalculateUsage(dto),
    };
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.getById(id),
    };
  }

  @Get(":id/stats")
  async getStats(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.getStats(id),
    };
  }

  @Patch(":id")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async update(@Param("id") id: string, @Body() dto: UpdatePromotionDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.update(id, dto),
    };
  }

  @Patch(":id/activate")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async activate(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.setActive(id, true),
    };
  }

  @Patch(":id/deactivate")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async deactivate(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.setActive(id, false),
    };
  }

  @Delete(":id")
  @Roles("MERCHANT_OWNER", "ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.promotionService.remove(id);
  }

  @Post("validate")
  async validate(@Body() dto: ValidatePromotionDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.validate(dto),
    };
  }

  @Post("apply")
  @Roles("CONSUMER", "ADMIN")
  async apply(@Body() dto: ApplyPromotionDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.promotionService.apply(dto),
    };
  }
}
