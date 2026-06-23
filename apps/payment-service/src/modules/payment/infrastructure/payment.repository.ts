import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { IRepository } from "@mythfood/shared-kernel";
import { Payment } from "../domain/payment.aggregate";
import { PaymentId } from "../domain/payment-id";
import { PaymentEntity } from "./payment.entity";
import { PaymentMapper } from "./payment.mapper";

@Injectable()
export class PaymentRepository implements IRepository<Payment, PaymentId> {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly repository: TypeOrmRepo<PaymentEntity>,
  ) {}

  async save(aggregate: Payment): Promise<void> {
    const entity = PaymentMapper.toPersistence(aggregate);
    await this.repository.save(entity);
  }

  async findById(id: PaymentId): Promise<Payment | null> {
    const entity = await this.repository.findOne({
      where: { id: id.toString() },
    });
    if (!entity) return null;
    return PaymentMapper.toDomain(entity);
  }

  async findByIdOrFail(id: PaymentId): Promise<Payment> {
    const payment = await this.findById(id);
    if (!payment) throw new Error(`Payment with id ${id.toString()} not found`);
    return payment;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const entity = await this.repository.findOne({ where: { orderId } });
    if (!entity) return null;
    return PaymentMapper.toDomain(entity);
  }

  async findByConsumerId(consumerId: string): Promise<Payment[]> {
    const entities = await this.repository.find({ where: { consumerId } });
    return entities.map((e) => PaymentMapper.toDomain(e));
  }

  async findByMerchantId(merchantId: string): Promise<Payment[]> {
    const entities = await this.repository.find({ where: { merchantId } });
    return entities.map((e) => PaymentMapper.toDomain(e));
  }

  async findAll(): Promise<Payment[]> {
    const entities = await this.repository.find();
    return entities.map((e) => PaymentMapper.toDomain(e));
  }

  async exists(id: PaymentId): Promise<boolean> {
    const count = await this.repository.count({ where: { id: id.toString() } });
    return count > 0;
  }

  async delete(aggregate: Payment): Promise<void> {
    await this.repository.delete(aggregate.id.toString());
  }

  async deleteById(id: PaymentId): Promise<void> {
    await this.repository.delete(id.toString());
  }
}
