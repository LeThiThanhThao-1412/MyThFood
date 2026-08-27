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
