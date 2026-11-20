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
import { AssistantService } from "../application/assistant.service";
import {
  AnalyzeCaseDto,
  ReviewAnalysisDto,
} from "../application/dtos/assistant.dto";

/**
 * Trợ lý AI cho admin (human-in-the-loop).
 *
 * - `GET  /assistant/health`                       → trạng thái cấu hình model
 * - `GET  /assistant/cases/:id/context`            → dữ liệu sẽ gửi cho model (debug)
 * - `GET  /assistant/cases/:id/analysis`           → bản phân tích đã lưu (AI tự chạy nền)
 * - `POST /assistant/cases/:id/analyze`            → chạy lại phân tích
 * - `POST /assistant/cases/:id/analysis/review`    → admin duyệt / bỏ qua gợi ý
 *
 * Tất cả đều yêu cầu ADMIN: đây là công cụ nội bộ, không lộ cho người dùng.
 */
@Controller("assistant")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get("health")
  @Roles("ADMIN")
  health() {
    return {
      statusCode: HttpStatus.OK,
      data: this.assistantService.getHealth(),
    };
  }

  @Get("cases/:id/context")
  @Roles("ADMIN")
  async context(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.assistantService.getContext(id),
    };
  }

  @Post("cases/:id/analyze")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  async analyze(
    @Param("id") id: string,
    @Body() dto: AnalyzeCaseDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.assistantService.analyzeCase(id, dto, req.user),
    };
  }

  /**
   * Bản phân tích đã lưu của vụ việc (AI chạy nền lúc khiếu nại được tạo).
   *
   * Trả `data: null` khi chưa có — admin-portal dùng để biết có sẵn kết quả hay
   * phải chờ/chạy lại.
   */
  @Get("cases/:id/analysis")
  @Roles("ADMIN")
  async analysis(@Param("id") id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.assistantService.getAnalysis(id),
      // Chẩn đoán: lần tự phân tích gần nhất chạy/ lỗi vì sao (chỉ trong RAM).
      auto: this.assistantService.getAutoStatus(id),
    };
  }

  /**
   * Badge AI cho NHIỀU vụ việc cùng lúc (lưới vụ việc ở admin-portal).
   *
   * `?caseIds=id1,id2,...` — một request thay vì N request `/analysis`.
   */
  @Get("analyses")
  @Roles("ADMIN")
  async analyses(@Query("caseIds") caseIds?: string) {
    const ids = (caseIds ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return {
      statusCode: HttpStatus.OK,
      data: await this.assistantService.listSummaries(ids),
    };
  }

  /** Admin duyệt / bỏ qua gợi ý AI — lưu vết ai duyệt, lúc nào, ghi chú gì. */
  @Post("cases/:id/analysis/review")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  async review(
    @Param("id") id: string,
    @Body() dto: ReviewAnalysisDto,
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.assistantService.reviewAnalysis(
        id,
        dto.decision,
        req.user,
        dto.note,
      ),
    };
  }
}
