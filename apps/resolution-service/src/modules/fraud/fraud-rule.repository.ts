import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { FraudRuleEntity } from "./fraud-rule.entity";

@Injectable()
export class FraudRuleRepository {
  constructor(
    @InjectRepository(FraudRuleEntity)
    private readonly repo: TypeOrmRepo<FraudRuleEntity>,
  ) {}

  async save(rule: FraudRuleEntity): Promise<FraudRuleEntity> {
    return this.repo.save(rule);
  }

  async findAll(): Promise<FraudRuleEntity[]> {
    return this.repo.find({ order: { createdAt: "ASC" } });
  }

  async findById(id: string): Promise<FraudRuleEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
