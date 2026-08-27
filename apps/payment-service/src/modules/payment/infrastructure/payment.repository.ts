import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository as TypeOrmRepo } from "typeorm";
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

  async getDailyStats(startDate?: string, endDate?: string): Promise<any> {
    const where: Record<string, unknown> = { status: "COMPLETED" };
    if (startDate || endDate) {
      const from = startDate ? new Date(startDate) : new Date(0);
      const to = endDate ? new Date(endDate) : new Date(8640000000000000);
      where["createdAt"] = Between(from, to);
    }

    const entities = await this.repository.find({ where });

    const byDay = new Map<
      string,
      {
        transactions: number;
        amount: number;
        codAmount: number;
        stripeAmount: number;
      }
    >();

    for (const p of entities) {
      const date = p.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(date) ?? {
        transactions: 0,
        amount: 0,
        codAmount: 0,
        stripeAmount: 0,
      };
      bucket.transactions += 1;
      bucket.amount += Number(p.amount);
      if (p.paymentMethod === "CASH") {
        bucket.codAmount += Number(p.amount);
      } else {
        bucket.stripeAmount += Number(p.amount);
      }
      byDay.set(date, bucket);
    }

    const dailyStats = [...byDay.entries()]
      .map(([date, b]) => ({ date, ...b }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalAmount = dailyStats.reduce((s, d) => s + d.amount, 0);
    const totalTransactions = dailyStats.reduce(
      (s, d) => s + d.transactions,
      0,
    );
    const codAmount = dailyStats.reduce((s, d) => s + d.codAmount, 0);
    const codPercentage =
      totalAmount > 0 ? Math.round((codAmount / totalAmount) * 10000) / 100 : 0;
    const stripePercentage =
      totalAmount > 0
        ? Math.round(((totalAmount - codAmount) / totalAmount) * 10000) / 100
        : 0;

    return {
      dailyStats,
      summary: {
        totalAmount,
        totalTransactions,
        codPercentage,
        stripePercentage,
      },
    };
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
