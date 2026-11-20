import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { v4 as uuid } from "uuid";
import { MerchantComplianceStateEntity } from "./merchant-compliance-state.entity";
import { MerchantCompliancePenaltyEntity } from "./merchant-compliance-penalty.entity";

@Injectable()
export class MerchantComplianceRepository {
  constructor(
    @InjectRepository(MerchantComplianceStateEntity)
    private readonly stateRepo: TypeOrmRepo<MerchantComplianceStateEntity>,
    @InjectRepository(MerchantCompliancePenaltyEntity)
    private readonly penaltyRepo: TypeOrmRepo<MerchantCompliancePenaltyEntity>,
  ) {}

  async getState(
    merchantId: string,
  ): Promise<MerchantComplianceStateEntity | null> {
    return this.stateRepo.findOne({ where: { merchant_id: merchantId } });
  }

  async saveState(input: {
    merchantId: string;
    penaltyLevel: number;
    lastPenaltyAt: Date;
  }): Promise<void> {
    let state = await this.getState(input.merchantId);
    if (!state) {
      state = new MerchantComplianceStateEntity();
      state.merchant_id = input.merchantId;
      state.penalty_level = 0;
      state.last_penalty_at = null;
    }
    state.penalty_level = input.penaltyLevel;
    state.last_penalty_at = input.lastPenaltyAt;
    await this.stateRepo.save(state);
  }

  async recordPenalty(input: {
    merchantId: string;
    level: number;
    type: string;
    amount: number | null;
    reason: string;
  }): Promise<MerchantCompliancePenaltyEntity> {
    const entity = new MerchantCompliancePenaltyEntity();
    entity.id = uuid();
    entity.merchant_id = input.merchantId;
    entity.level = input.level;
    entity.type = input.type;
    entity.amount = input.amount;
    entity.reason = input.reason;
    return this.penaltyRepo.save(entity);
  }

  async listPenalties(options?: {
    merchantId?: string;
    take?: number;
  }): Promise<MerchantCompliancePenaltyEntity[]> {
    return this.penaltyRepo.find({
      where: options?.merchantId ? { merchant_id: options.merchantId } : {},
      order: { created_at: "DESC" },
      take: options?.take ?? 100,
    });
  }
}
