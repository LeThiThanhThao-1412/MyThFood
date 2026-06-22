import { Injectable } from '@nestjs/common';
import { Result, DomainError, EntityNotFoundError } from '@mythfood/shared-kernel';
import { Consumer, Gender } from '../domain/consumer.aggregate';
import { ConsumerId } from '../domain/consumer-id';
import { Address, GpsCoordinates } from '../domain/address.vo';
import { PaymentMethod, PaymentMethodType } from '../domain/payment-method.vo';
import { ConsumerRepository } from '../infrastructure/consumer.repository';

@Injectable()
export class ConsumerService {
  constructor(private readonly repository: ConsumerRepository) {}

  async createConsumer(props: {
    userId: string; fullName: string; avatar?: string; dateOfBirth?: Date; gender?: Gender;
  }): Promise<Result<Consumer, DomainError>> {
    const result = Consumer.create(props);
    if (result.isFailure) return result;
    await this.repository.save(result.value);
    return result;
  }

  async getById(id: string): Promise<Consumer | null> {
    return this.repository.findById(ConsumerId.from(id));
  }

  async getByUserId(userId: string): Promise<Consumer | null> {
    return this.repository.findByUserId(userId);
  }

  async updateProfile(id: string, props: {
    fullName?: string; avatar?: string; dateOfBirth?: Date; gender?: Gender;
  }): Promise<Result<Consumer, DomainError>> {
    const consumer = await this.repository.findById(ConsumerId.from(id));
    if (!consumer) return Result.fail(new EntityNotFoundError('Consumer', id));
    const r = consumer.updateProfile(props);
    if (r.isFailure) return Result.fail(r.error);
    await this.repository.save(consumer);
    return Result.ok(consumer);
  }

  async addAddress(consumerId: string, props: {
    label: string; fullAddress: string; city: string; district: string; ward: string; street: string;
    gps?: { latitude: number; longitude: number }; type?: string;
  }): Promise<Result<Consumer, DomainError>> {
    const consumer = await this.repository.findById(ConsumerId.from(consumerId));
    if (!consumer) return Result.fail(new EntityNotFoundError('Consumer', consumerId));
    let gps: GpsCoordinates | undefined;
    if (props.gps) {
      const gr = GpsCoordinates.create(props.gps.latitude, props.gps.longitude);
      if (gr.isFailure) return Result.fail(gr.error);
      gps = gr.value;
    }
    const ar = Address.create({ ...props, gps, type: props.type as 'HOME' | 'WORK' | 'OTHER' | undefined });
    if (ar.isFailure) return Result.fail(ar.error);
    const r = consumer.addAddress(ar.value);
    if (r.isFailure) return Result.fail(r.error);
    await this.repository.save(consumer);
    return Result.ok(consumer);
  }

  async removeAddress(consumerId: string, addressId: string): Promise<Result<Consumer, DomainError>> {
    const consumer = await this.repository.findById(ConsumerId.from(consumerId));
    if (!consumer) return Result.fail(new EntityNotFoundError('Consumer', consumerId));
    const r = consumer.removeAddress(addressId);
    if (r.isFailure) return Result.fail(r.error);
    await this.repository.save(consumer);
    return Result.ok(consumer);
  }

  async setDefaultAddress(consumerId: string, addressId: string): Promise<Result<Consumer, DomainError>> {
    const consumer = await this.repository.findById(ConsumerId.from(consumerId));
    if (!consumer) return Result.fail(new EntityNotFoundError('Consumer', consumerId));
    const r = consumer.setDefaultAddress(addressId);
    if (r.isFailure) return Result.fail(r.error);
    await this.repository.save(consumer);
    return Result.ok(consumer);
  }

  async addPaymentMethod(consumerId: string, props: {
    type: PaymentMethodType; provider: string; token: string; lastFourDigits: string; expiryDate?: Date;
  }): Promise<Result<Consumer, DomainError>> {
    const consumer = await this.repository.findById(ConsumerId.from(consumerId));
    if (!consumer) return Result.fail(new EntityNotFoundError('Consumer', consumerId));
    const mr = PaymentMethod.create(props);
    if (mr.isFailure) return Result.fail(mr.error);
    const r = consumer.addPaymentMethod(mr.value);
    if (r.isFailure) return Result.fail(r.error);
    await this.repository.save(consumer);
    return Result.ok(consumer);
  }

  async removePaymentMethod(consumerId: string, paymentMethodId: string): Promise<Result<Consumer, DomainError>> {
    const consumer = await this.repository.findById(ConsumerId.from(consumerId));
    if (!consumer) return Result.fail(new EntityNotFoundError('Consumer', consumerId));
    const r = consumer.removePaymentMethod(paymentMethodId);
    if (r.isFailure) return Result.fail(r.error);
    await this.repository.save(consumer);
    return Result.ok(consumer);
  }

  async setDefaultPaymentMethod(consumerId: string, paymentMethodId: string): Promise<Result<Consumer, DomainError>> {
    const consumer = await this.repository.findById(ConsumerId.from(consumerId));
    if (!consumer) return Result.fail(new EntityNotFoundError('Consumer', consumerId));
    const r = consumer.setDefaultPaymentMethod(paymentMethodId);
    if (r.isFailure) return Result.fail(r.error);
    await this.repository.save(consumer);
    return Result.ok(consumer);
  }
}