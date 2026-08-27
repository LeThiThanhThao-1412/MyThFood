import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { v4 as uuidv4 } from "uuid";
import { ReviewRepository } from "./review.repository";
import { ReviewEntity } from "./review.entity";
import { CreateReviewDto, ReplyReviewDto } from "./review.dto";

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly reviewRepo: ReviewRepository,
    private readonly httpService: HttpService,
  ) {}

  async create(dto: CreateReviewDto): Promise<ReviewEntity> {
    await this.validateOrder(dto.orderId, dto.consumerId);

    const existing = await this.reviewRepo.findByOrderId(dto.orderId);
    if (existing) {
      throw new BadRequestException("Order already has a review");
    }
    const review = new ReviewEntity();
    review.id = uuidv4();
    review.orderId = dto.orderId;
    review.consumerId = dto.consumerId;
    review.merchantId = dto.merchantId;
    review.rating = dto.rating;
    review.comment = dto.comment ?? null;
    review.tags = dto.tags ?? [];
    review.merchantReply = null;
    const saved = await this.reviewRepo.save(review);

    // Best-effort: đồng bộ rating trung bình sang merchant-service
    void this.syncMerchantRating(dto.merchantId);

    return saved;
  }

  private async syncMerchantRating(merchantId: string): Promise<void> {
    try {
      const averageRating = await this.reviewRepo.getAverageRating(merchantId);
      const totalRatings = await this.reviewRepo.countByMerchant(merchantId);
      const url =
        process.env.MERCHANT_SERVICE_URL || "http://merchant-service:3003";
      const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
      await firstValueFrom(
        this.httpService.patch(
          `${url}/api/v1/merchants/${merchantId}/rating`,
          {
            rating: Number(averageRating.toFixed(2)),
            totalRatings,
          },
          {
            headers: {
              "Content-Type": "application/json",
              "x-service-key": serviceKey,
            },
          },
        ),
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to sync merchant rating for ${merchantId}: ${err?.message}`,
      );
    }
  }

  private async validateOrder(
    orderId: string,
    consumerId: string,
  ): Promise<void> {
    const url = process.env.ORDER_SERVICE_URL || "http://order-service:3004";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${url}/api/v1/orders/${orderId}`, {
          headers: { "x-service-key": serviceKey },
        }),
      );
      const data: any = res.data;
      const order = data?.data ?? data;
      if (!order) {
        throw new BadRequestException("Order not found");
      }
      if (order.consumerId !== consumerId) {
        throw new BadRequestException("Order does not belong to this consumer");
      }
      if (order.status !== "DELIVERED") {
        throw new BadRequestException("Only delivered orders can be reviewed");
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.warn(`Failed to validate order ${orderId}: ${err?.message}`);
      throw new BadRequestException("Unable to validate order");
    }
  }

  async getByOrderId(orderId: string): Promise<ReviewEntity | null> {
    return this.reviewRepo.findByOrderId(orderId);
  }

  async getByMerchantId(
    merchantId: string,
    skip: number,
    take: number,
  ): Promise<{ items: ReviewEntity[]; total: number; averageRating: number }> {
    const { items, total } = await this.reviewRepo.findByMerchantId(
      merchantId,
      skip,
      take,
    );
    const averageRating = await this.reviewRepo.getAverageRating(merchantId);
    return { items, total, averageRating };
  }

  async reply(id: string, dto: ReplyReviewDto): Promise<ReviewEntity> {
    const review = await this.reviewRepo.findById(id);
    if (!review) throw new NotFoundException("Review not found");
    review.merchantReply = dto.reply;
    return this.reviewRepo.save(review);
  }
}
