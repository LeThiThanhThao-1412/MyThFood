import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../../auth/service-key-or-jwt.guard";
import { PenaltyService } from "../application/penalty.service";
import {
  AppealPenaltyDto,
  DecideAppealDto,
  IssuePenaltyDto,
} from "../application/dtos/penalty.dto";
import { PenaltyStatus } from "../domain/penalty.enums";

@Controller("penalties")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class PenaltyController {
  constructor(private readonly penaltyService: PenaltyService) {}

  @Post()
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async issue(@Body() dto: IssuePenaltyDto, @Req() req: any) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.penaltyService.issue(dto, req.user),
    };
  }

  @Get()
  async list(
    @Query("targetId") targetId?: string,
    @Query("targetType") targetType?: string,
    @Query("status") status?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    const { items, total } = await this.penaltyService.list({
      targetId,
      targetType,
      status: status as PenaltyStatus | undefined,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
    });
    return { statusCode: HttpStatus.OK, data: items, total };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return { statusCode: HttpStatus.OK, data: await this.penaltyService.get(id) };
  }

  @Post(":id/appeal")
  @Roles("CONSUMER", "DRIVER", "MERCHANT_OWNER", "ADMIN")
  async appeal(
    @Param("id") id: string,
    @Body() dto: AppealPenaltyDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.penaltyService.appeal(id, dto, req.user),
    };
  }

  @Post(":id/appeal/decide")
  @Roles("ADMIN")
  async decideAppeal(
    @Param("id") id: string,
    @Body() dto: DecideAppealDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.penaltyService.decideAppeal(id, dto, req.user),
    };
  }

  @Post(":id/waive")
  @Roles("ADMIN")
  async waive(@Param("id") id: string, @Req() req: any) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.penaltyService.waive(id, req.user),
    };
  }
}
