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
import { CaseService } from "../application/case.service";
import {
  ActorIdDto,
  AddEvidenceDto,
  CreateCaseDto,
  ResolveCaseDto,
  RespondCaseDto,
} from "../application/dtos/case.dto";
import {
  CaseCategory,
  CaseStatus,
  CaseType,
  Severity,
} from "../domain/case.enums";

@Controller("cases")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  @Post()
  @Roles("CONSUMER", "DRIVER", "MERCHANT_OWNER", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCaseDto, @Req() req: any) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.caseService.create(dto, req.user),
    };
  }

  @Get()
  async list(
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("category") category?: string,
    @Query("severity") severity?: string,
    @Query("actorId") actorId?: string,
    @Query("orderId") orderId?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    const { items, total } = await this.caseService.list({
      status: status as CaseStatus | undefined,
      type: type as CaseType | undefined,
      category: category as CaseCategory | undefined,
      severity: severity as Severity | undefined,
      actorId,
      orderId,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
    });
    return { statusCode: HttpStatus.OK, data: items, total };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return { statusCode: HttpStatus.OK, data: await this.caseService.get(id) };
  }

  @Get(":id/timeline")
  async timeline(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.getTimeline(id),
    };
  }

  @Post(":id/evidence")
  @Roles("CONSUMER", "ADMIN")
  async addEvidence(
    @Param("id") id: string,
    @Body() dto: AddEvidenceDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.addEvidence(id, dto, req.user),
    };
  }

  @Post(":id/review")
  @Roles("ADMIN")
  async review(@Param("id") id: string, @Req() req: any) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.review(id, req.user),
    };
  }

  @Post(":id/request-evidence")
  @Roles("ADMIN")
  async requestEvidence(@Param("id") id: string, @Req() req: any) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.requestEvidence(id, req.user),
    };
  }

  @Post(":id/resolve")
  @Roles("ADMIN")
  async resolve(
    @Param("id") id: string,
    @Body() dto: ResolveCaseDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.resolve(id, dto, req.user),
    };
  }

  @Post(":id/respond")
  @Roles("CONSUMER", "DRIVER", "MERCHANT_OWNER", "ADMIN")
  async respond(
    @Param("id") id: string,
    @Body() dto: RespondCaseDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.respond(id, dto, req.user),
    };
  }

  @Post(":id/confirm")
  @Roles("CONSUMER", "DRIVER", "MERCHANT_OWNER", "ADMIN")
  async confirm(
    @Param("id") id: string,
    @Body() dto: ActorIdDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.confirm(id, dto, req.user),
    };
  }

  @Post(":id/withdraw")
  @Roles("CONSUMER", "DRIVER", "MERCHANT_OWNER", "ADMIN")
  async withdraw(
    @Param("id") id: string,
    @Body() dto: ActorIdDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.withdraw(id, dto, req.user),
    };
  }

  @Post(":id/escalate")
  @Roles("ADMIN")
  async escalate(@Param("id") id: string, @Req() req: any) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.caseService.escalate(id, req.user),
    };
  }
}
