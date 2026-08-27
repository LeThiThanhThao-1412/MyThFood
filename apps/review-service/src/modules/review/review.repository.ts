import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
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
}
