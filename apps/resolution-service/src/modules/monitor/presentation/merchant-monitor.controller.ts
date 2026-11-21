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
import { MerchantMonitorService } from "../application/merchant-monitor.service";

@Controller("merchant-monitor")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class MerchantMonitorController {
  constructor(private readonly monitorService: MerchantMonitorService) {}

  /**
   * Sức khỏe nhà hàng theo cửa sổ khiếu nại (mặc định 7 ngày):
   * tổng đơn, đơn hủy, khiếu nại hợp lệ/tổng, tỉ lệ và cảnh báo còn hiệu lực.
   */
  @Get(":merchantId/health")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async getHealth(
    @Param("merchantId") merchantId: string,
    @Query("days") days?: string,
    @Req() req?: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.monitorService.getHealth(
        merchantId,
        req?.user,
        days ? parseInt(days, 10) : undefined,
      ),
    };
  }

  /** Nhà hàng bấm "Đã hiểu" để ẩn cảnh báo trong tuần. */
  @Post("warnings/:warningId/dismiss")
  @HttpCode(HttpStatus.OK)
  @Roles("MERCHANT_OWNER", "ADMIN")
  async dismissWarning(
    @Param("warningId") warningId: string,
    @Body() body: { merchantId: string },
    @Req() req: any,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.monitorService.dismissWarning(
        warningId,
        body?.merchantId,
        req.user,
      ),
    };
  }

  /** Admin chạy đánh giá ngay (cron vẫn tự chạy mỗi 6 giờ). */
  @Post("evaluate")
  @HttpCode(HttpStatus.OK)
  @Roles("ADMIN")
  async evaluate(@Query("days") days?: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.monitorService.evaluateAll(
        days ? parseInt(days, 10) : undefined,
      ),
    };
  }
}
