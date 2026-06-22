import { ConsumerId } from '../domain/consumer-id';
import { Consumer, Gender } from '../domain/consumer.aggregate';
import { Address, GpsCoordinates, AddressType } from '../domain/address.vo';
import { AddressId } from '../domain/address-id';
import { PaymentMethod, PaymentMethodType, PaymentMethodId } from '../domain/payment-method.vo';
import { ConsumerEntity } from './consumer.entity';

export class ConsumerMapper {
  public static toDomain(entity: ConsumerEntity): Consumer {
    const id = ConsumerId.from(entity.id);
    const gender = (entity.gender as Gender) ?? null;
    const addresses = ConsumerMapper.parseAddresses(entity.addresses);
    const paymentMethods = ConsumerMapper.parsePaymentMethods(entity.payment_methods);

    return Consumer.rehydrate(id, {
      userId: entity.user_id,
      fullName: entity.full_name,
      avatar: entity.avatar,
      dateOfBirth: entity.date_of_birth ? new Date(entity.date_of_birth) : null,
      gender,
      addresses,
      paymentMethods,
    });
  }

  public static toPersistence(consumer: Consumer): ConsumerEntity {
    const entity = new ConsumerEntity();
    entity.id = consumer.id.toString();
    entity.user_id = consumer.userIdValue;
    entity.full_name = consumer.displayName;
    entity.avatar = consumer.avatarUrl;
    entity.date_of_birth = consumer.birthDate;
    entity.gender = consumer.consumerGender;
    entity.addresses = JSON.stringify(consumer.addressList.map(ConsumerMapper.serializeAddress));
    entity.payment_methods = JSON.stringify(consumer.paymentMethodList.map(ConsumerMapper.serializePaymentMethod));
    return entity;
  }

  private static parseAddresses(json: string): Address[] {
    try {
      const raw: unknown = JSON.parse(json);
      if (!Array.isArray(raw)) return [];
      return raw.map((item: Record<string, unknown>) => ConsumerMapper.deserializeAddress(item));
    } catch { return []; }
  }

  private static deserializeAddress(raw: Record<string, unknown>): Address {
    const gpsRaw = raw.gps as Record<string, unknown> | null | undefined;
    const gps = gpsRaw
      ? GpsCoordinates.create(gpsRaw.latitude as number, gpsRaw.longitude as number).value
      : null;

    return Address.rehydrate({
      id: AddressId.from(raw.id as string),
      label: raw.label as string,
      fullAddress: raw.fullAddress as string,
      city: raw.city as string,
      district: (raw.district as string) ?? '',
      ward: (raw.ward as string) ?? '',
      street: (raw.street as string) ?? '',
      gps,
      type: (raw.type as AddressType) ?? 'HOME',
      isDefault: (raw.isDefault as boolean) ?? false,
    });
  }

  private static serializeAddress(address: Address): Record<string, unknown> {
    return {
      id: address.id.toString(), label: address.label, fullAddress: address.fullAddress,
      city: address.city, district: address.district, ward: address.ward, street: address.street,
      gps: address.gps ? { latitude: address.gps.latitude, longitude: address.gps.longitude } : null,
      type: address.type, isDefault: address.isDefault,
    };
  }

  private static parsePaymentMethods(json: string): PaymentMethod[] {
    try {
      const raw: unknown = JSON.parse(json);
      if (!Array.isArray(raw)) return [];
      return raw.map((item: Record<string, unknown>) => ConsumerMapper.deserializePaymentMethod(item));
    } catch { return []; }
  }

  private static deserializePaymentMethod(raw: Record<string, unknown>): PaymentMethod {
    return PaymentMethod.rehydrate({
      id: PaymentMethodId.from(raw.id as string),
      type: (raw.type as PaymentMethodType) ?? 'CREDIT_CARD',
      provider: raw.provider as string,
      token: raw.token as string,
      lastFourDigits: raw.lastFourDigits as string,
      isDefault: (raw.isDefault as boolean) ?? false,
      expiryDate: raw.expiryDate ? new Date(raw.expiryDate as string) : null,
    });
  }

  private static serializePaymentMethod(method: PaymentMethod): Record<string, unknown> {
    return {
      id: method.id.toString(), type: method.type, provider: method.provider,
      token: method.token, lastFourDigits: method.lastFourDigits, isDefault: method.isDefault,
      expiryDate: method.expiryDate?.toISOString() ?? null,
    };
  }
}