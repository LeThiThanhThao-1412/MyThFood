import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository as TypeOrmRepo } from "typeorm";
import { ReviewEntity } from "./review.entity";

@Injectable()
export class ReviewRepository {
  constructor(
    @InjectRepository(ReviewEntity)
    private readonly repo: TypeOrmRepo<ReviewEntity>,
  ) {}

  async save(review: ReviewEntity): Promise<ReviewEntity> {
    return this.repo.save(review);
  }

  async findByOrderId(orderId: string): Promise<ReviewEntity | null> {
    return this.repo.findOne({ where: { orderId } });
  }

  async findById(id: string): Promise<ReviewEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByMerchantId(
    merchantId: string,
    skip: number,
    take: number,
  ): Promise<{ items: ReviewEntity[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      where: { merchantId },
      order: { createdAt: "DESC" },
      skip,
      take,
    });
    return { items, total };
  }

  async getAverageRating(merchantId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder("r")
      .select("AVG(r.rating)", "avg")
      .where("r.merchantId = :merchantId", { merchantId })
      .getRawOne();
    return result?.avg ? Number(result.avg) : 0;
  }

  async countByMerchant(merchantId: string): Promise<number> {
    return this.repo.count({ where: { merchantId } });
  }

  /**
   * Đánh giá mà khách hàng dành cho tài xế.
   * Mỗi đơn chỉ có 1 review, có thể kèm hoặc không kèm đánh giá tài xế
   * → chỉ lấy các review thực sự có driverRating.
   */
  async findByDriverId(
    driverId: string,
    skip: number,
    take: number,
  ): Promise<{ items: ReviewEntity[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      where: { driverId, driverRating: Not(IsNull()) },
      order: { createdAt: "DESC" },
      skip,
      take,
    });
    return { items, total };
  }

  async getAverageDriverRating(driverId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder("r")
      .select("AVG(r.driverRating)", "avg")
      .where("r.driverId = :driverId", { driverId })
      .andWhere("r.driverRating IS NOT NULL")
      .getRawOne();
    return result?.avg ? Number(result.avg) : 0;
  }

  /** Số lượng đánh giá theo từng mức sao (1..5) của tài xế. */
  async getDriverRatingBreakdown(
    driverId: string,
  ): Promise<Record<number, number>> {
    const rows = await this.repo
      .createQueryBuilder("r")
      .select("r.driverRating", "rating")
      .addSelect("COUNT(*)", "count")
      .where("r.driverId = :driverId", { driverId })
      .andWhere("r.driverRating IS NOT NULL")
      .groupBy("r.driverRating")
      .getRawMany();

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of rows) {
      const star = Number(row.rating);
      if (star >= 1 && star <= 5) {
        breakdown[star] = Number(row.count);
      }
    }
    return breakdown;
  }
}
