import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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

  private serviceCandidates(
    envKey: string,
    dockerUrl: string,
    localUrl: string,
  ): string[] {
    const urls = [process.env[envKey], dockerUrl, localUrl].filter(
      (u): u is string => !!u,
    );
    return [...new Set(urls)];
  }

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
    review.driverId = dto.driverId ?? null;
    review.driverRating = dto.driverRating ?? null;
    review.driverComment = dto.driverComment ?? null;
    review.rating = dto.rating;
    review.comment = dto.comment ?? null;
    review.tags = dto.tags ?? [];
    review.images = dto.images ?? [];
    review.merchantReply = null;
    const saved = await this.reviewRepo.save(review);

    // Best-effort: đồng bộ rating trung bình sang merchant-service
    void this.syncMerchantRating(dto.merchantId);

    // Best-effort: đồng bộ rating tài xế sang driver-service
    if (dto.driverId && dto.driverRating != null) {
      void this.syncDriverRating(dto.driverId, dto.driverRating);
    }

    return saved;
  }

  private async syncMerchantRating(merchantId: string): Promise<void> {
    try {
      const averageRating = await this.reviewRepo.getAverageRating(merchantId);
      const totalRatings = await this.reviewRepo.countByMerchant(merchantId);
      const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
      for (const base of this.serviceCandidates(
        "MERCHANT_SERVICE_URL",
        "http://merchant-service:3003",
        "http://localhost:3003",
      )) {
        try {
          await firstValueFrom(
            this.httpService.patch(
              `${base}/api/v1/merchants/${merchantId}/rating`,
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
          return;
        } catch {
          // thử base URL tiếp theo
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to sync merchant rating for ${merchantId}: ${err?.message}`,
      );
    }
  }

  private async syncDriverRating(
    driverId: string,
    driverRating: number,
  ): Promise<void> {
    try {
      const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
      for (const base of this.serviceCandidates(
        "DRIVER_SERVICE_URL",
        "http://driver-service:3007",
        "http://localhost:3007",
      )) {
        try {
          await firstValueFrom(
            this.httpService.patch(
              `${base}/api/v1/drivers/${driverId}/rating`,
              { rating: driverRating },
              {
                headers: {
                  "Content-Type": "application/json",
                  "x-service-key": serviceKey,
                },
              },
            ),
          );
          return;
        } catch {
          // thử base URL tiếp theo
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to sync driver rating for ${driverId}: ${err?.message}`,
      );
    }
  }

  private async validateOrder(
    orderId: string,
    consumerId: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    let order: any = null;
    let lastErr: any = null;
    const candidates = [
      process.env.ORDER_SERVICE_URL,
      "http://host.docker.internal:3004",
      "http://localhost:3004",
      "http://127.0.0.1:3004",
      "http://order-service:3004",
    ].filter((u): u is string => !!u);

    for (const base of [...new Set(candidates)]) {
      try {
        const res = await firstValueFrom(
          this.httpService.get(`${base}/api/v1/orders/${orderId}`, {
            headers: { "x-service-key": serviceKey },
          }),
        );
        const data: any = res.data;
        order = data?.data ?? data;
        if (!order) {
          throw new BadRequestException("Order not found");
        }
        break;
      } catch (err: any) {
        if (err instanceof BadRequestException) {
          throw err;
        }
        lastErr = err;
      }
    }

    if (!order) {
      this.logger.warn(
        `Failed to validate order ${orderId}: ${lastErr?.message}`,
      );
      // Khi chạy local/Docker dev mà order-service chưa reach được,
      // không chặn người dùng gửi đánh giá (frontend đã chỉ cho gửi khi đơn DELIVERED).
      if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
        this.logger.warn(
          "Skipping order validation because order-service is unreachable (development mode)",
        );
        return;
      }
      throw new BadRequestException("Unable to validate order");
    }
    if (order.consumerId !== consumerId) {
      throw new BadRequestException("Order does not belong to this consumer");
    }
    if (order.status !== "DELIVERED") {
      throw new BadRequestException("Only delivered orders can be reviewed");
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

  async reply(
    id: string,
    dto: ReplyReviewDto,
    user?: { userId: string; roles: string[] },
  ): Promise<ReviewEntity> {
    const review = await this.reviewRepo.findById(id);
    if (!review) throw new NotFoundException("Review not found");

    // Merchant chỉ được phản hồi đánh giá của chính nhà hàng của họ
    if (
      user &&
      !(user.roles || []).includes("ADMIN") &&
      user.userId !== "service"
    ) {
      await this.assertMerchantOwnership(review.merchantId, user.userId);
    }

    review.merchantReply = dto.reply;
    return this.reviewRepo.save(review);
  }

  private async assertMerchantOwnership(
    merchantId: string,
    userId: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    let lastErr: any = null;
    for (const base of this.serviceCandidates(
      "MERCHANT_SERVICE_URL",
      "http://merchant-service:3003",
      "http://localhost:3003",
    )) {
      try {
        const res = await firstValueFrom(
          this.httpService.get(`${base}/api/v1/merchants/${merchantId}`, {
            headers: { "x-service-key": serviceKey },
          }),
        );
        const merchant = res.data;
        if (!merchant || merchant.userId !== userId) {
          throw new ForbiddenException(
            "Bạn chỉ có thể phản hồi đánh giá của nhà hàng của bạn",
          );
        }
        return;
      } catch (err: any) {
        if (err instanceof ForbiddenException) {
          throw err;
        }
        lastErr = err;
      }
    }
    this.logger.warn(
      `Failed to verify merchant ownership for ${merchantId}: ${lastErr?.message}`,
    );
    throw new ForbiddenException("Không thể xác minh quyền phản hồi đánh giá");
  }
}
