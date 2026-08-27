import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../auth/service-key-or-jwt.guard";
import { ReviewService } from "./review.service";
import { CreateReviewDto, ReplyReviewDto } from "./review.dto";

@Controller("reviews")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @Roles("CONSUMER", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateReviewDto) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.reviewService.create(dto),
    };
  }

  @Get("merchant/:merchantId")
  async getByMerchant(
    @Param("merchantId") merchantId: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    const result = await this.reviewService.getByMerchantId(
      merchantId,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
    return {
      statusCode: HttpStatus.OK,
      data: result.items,
      total: result.total,
      averageRating: result.averageRating,
    };
  }

  @Get("order/:orderId")
  async getByOrder(@Param("orderId") orderId: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.reviewService.getByOrderId(orderId),
    };
  }

  @Post(":id/reply")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async reply(@Param("id") id: string, @Body() dto: ReplyReviewDto) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.reviewService.reply(id, dto),
    };
  }
}
