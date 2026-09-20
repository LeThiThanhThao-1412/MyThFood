import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../auth/service-key-or-jwt.guard";
import { FraudRuleService } from "./fraud-rule.service";
import { CreateFraudRuleDto, UpdateFraudRuleDto } from "./fraud-rule.dto";

@Controller()
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class FraudRuleController {
  constructor(private readonly fraudRuleService: FraudRuleService) {}

  @Get("fraud-rules")
  @Roles("ADMIN")
  async list() {
    return {
      statusCode: HttpStatus.OK,
      data: await this.fraudRuleService.list(),
    };
  }

  @Post("fraud-rules")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateFraudRuleDto) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.fraudRuleService.create(dto),
    };
  }

  @Patch("fraud-rules/:id")
  @Roles("ADMIN")
  async update(@Param("id") id: string, @Body() dto: UpdateFraudRuleDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.fraudRuleService.update(id, dto),
    };
  }

  @Delete("fraud-rules/:id")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.fraudRuleService.delete(id);
  }

  @Post("fraud/detect")
  @Roles("ADMIN")
  async detect() {
    return {
      statusCode: HttpStatus.OK,
      data: await this.fraudRuleService.detectAnomalies(),
    };
  }
}
