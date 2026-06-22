import {
  AggregateRoot,
  Result,
  DomainError,
  BusinessRuleViolationError,
} from '@mythfood/shared-kernel';
import { ConsumerId } from './consumer-id';
import { Address } from './address.vo';
import { PaymentMethod } from './payment-method.vo';
import { ConsumerProfileUpdatedEvent } from './events/consumer-profile-updated.event';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface ConsumerProps {
  userId: string;
  fullName: string;
  avatar: string | null;
  dateOfBirth: Date | null;
  gender: Gender | null;
  addresses: Address[];
  paymentMethods: PaymentMethod[];
}

export class Consumer extends AggregateRoot<ConsumerId> {
  private userId: string;
  private fullName: string;
  private avatar: string | null;
  private dateOfBirth: Date | null;
  private gender: Gender | null;
  private addresses: Address[];
  private paymentMethods: PaymentMethod[];

  private constructor(id: ConsumerId, props: ConsumerProps) {
    super(id);
    this.userId = props.userId;
    this.fullName = props.fullName;
    this.avatar = props.avatar;
    this.dateOfBirth = props.dateOfBirth;
    this.gender = props.gender;
    this.addresses = props.addresses;
    this.paymentMethods = props.paymentMethods;
  }

  public static create(props: {
    userId: string;
    fullName: string;
    avatar?: string;
    dateOfBirth?: Date;
    gender?: Gender;
  }): Result<Consumer, DomainError> {
    if (!props.userId || props.userId.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('User ID is required'));
    }
    if (!props.fullName || props.fullName.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('Full name is required'));
    }

    const consumer = new Consumer(ConsumerId.create(), {
      userId: props.userId,
      fullName: props.fullName,
      avatar: props.avatar ?? null,
      dateOfBirth: props.dateOfBirth ?? null,
      gender: props.gender ?? null,
      addresses: [],
      paymentMethods: [],
    });

    consumer.addDomainEvent(
      new ConsumerProfileUpdatedEvent(consumer.id, {
        consumerId: consumer.id.toString(),
        userId: consumer.userId,
        fullName: consumer.fullName,
        avatar: consumer.avatar,
        dateOfBirth: consumer.dateOfBirth?.toISOString() ?? null,
        gender: consumer.gender,
      }),
    );

    return Result.ok(consumer);
  }

  public static rehydrate(id: ConsumerId, props: ConsumerProps): Consumer {
    return new Consumer(id, props);
  }

  public updateProfile(props: {
    fullName?: string;
    avatar?: string;
    dateOfBirth?: Date;
    gender?: Gender;
  }): Result<void, DomainError> {
    if (props.fullName !== undefined && props.fullName.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('Full name cannot be empty'));
    }
    if (props.fullName !== undefined) this.fullName = props.fullName;
    if (props.avatar !== undefined) this.avatar = props.avatar;
    if (props.dateOfBirth !== undefined) this.dateOfBirth = props.dateOfBirth;
    if (props.gender !== undefined) this.gender = props.gender;
    this.markUpdated();
    this.addDomainEvent(
      new ConsumerProfileUpdatedEvent(this.id, {
        consumerId: this.id.toString(),
        userId: this.userId,
        fullName: this.fullName,
        avatar: this.avatar,
        dateOfBirth: this.dateOfBirth?.toISOString() ?? null,
        gender: this.gender,
      }),
    );
    return Result.ok(undefined);
  }

  public addAddress(address: Address): Result<void, DomainError> {
    if (this.addresses.length >= 10) {
      return Result.fail(new BusinessRuleViolationError('Maximum 10 addresses allowed'));
    }
    if (this.addresses.length === 0) {
      address = address.setAsDefault();
    }
    this.addresses.push(address);
    this.markUpdated();
    return Result.ok(undefined);
  }

  public removeAddress(addressId: string): Result<void, DomainError> {
    const index = this.addresses.findIndex(a => a.id.toString() === addressId);
    if (index === -1) {
      return Result.fail(new BusinessRuleViolationError('Address not found'));
    }
    const removed = this.addresses[index]!;
    this.addresses.splice(index, 1);
    if (removed.isDefault && this.addresses.length > 0) {
      this.addresses[0] = this.addresses[0]!.setAsDefault();
    }
    this.markUpdated();
    return Result.ok(undefined);
  }

  public setDefaultAddress(addressId: string): Result<void, DomainError> {
    const found = this.addresses.some(a => a.id.toString() === addressId);
    if (!found) {
      return Result.fail(new BusinessRuleViolationError('Address not found'));
    }
    this.addresses = this.addresses.map((a) =>
      a.id.toString() === addressId ? a.setAsDefault() : a.unsetDefault(),
    );
    this.markUpdated();
    return Result.ok(undefined);
  }

  public addPaymentMethod(method: PaymentMethod): Result<void, DomainError> {
    if (this.paymentMethods.length >= 10) {
      return Result.fail(new BusinessRuleViolationError('Maximum 10 payment methods allowed'));
    }
    if (this.paymentMethods.length === 0) {
      method = method.setAsDefault();
    }
    this.paymentMethods.push(method);
    this.markUpdated();
    return Result.ok(undefined);
  }

  public removePaymentMethod(paymentMethodId: string): Result<void, DomainError> {
    const index = this.paymentMethods.findIndex(p => p.id.toString() === paymentMethodId);
    if (index === -1) {
      return Result.fail(new BusinessRuleViolationError('Payment method not found'));
    }
    const removed = this.paymentMethods[index]!;
    this.paymentMethods.splice(index, 1);
    if (removed.isDefault && this.paymentMethods.length > 0) {
      this.paymentMethods[0] = this.paymentMethods[0]!.setAsDefault();
    }
    this.markUpdated();
    return Result.ok(undefined);
  }

  public setDefaultPaymentMethod(paymentMethodId: string): Result<void, DomainError> {
    const found = this.paymentMethods.some(p => p.id.toString() === paymentMethodId);
    if (!found) {
      return Result.fail(new BusinessRuleViolationError('Payment method not found'));
    }
    this.paymentMethods = this.paymentMethods.map((p) =>
      p.id.toString() === paymentMethodId ? p.setAsDefault() : p.unsetDefault(),
    );
    this.markUpdated();
    return Result.ok(undefined);
  }

  get userIdValue(): string { return this.userId; }
  get displayName(): string { return this.fullName; }
  get avatarUrl(): string | null { return this.avatar; }
  get birthDate(): Date | null { return this.dateOfBirth; }
  get consumerGender(): Gender | null { return this.gender; }
  get addressList(): Address[] { return [...this.addresses]; }
  get paymentMethodList(): PaymentMethod[] { return [...this.paymentMethods]; }
  get defaultAddress(): Address | null { return this.addresses.find(a => a.isDefault) ?? null; }
  get defaultPaymentMethod(): PaymentMethod | null { return this.paymentMethods.find(p => p.isDefault) ?? null; }
  get addressCount(): number { return this.addresses.length; }
}