import { ValueObject, BusinessRuleViolationError, Result, DomainError, Identifier } from '@mythfood/shared-kernel';
import { v4 as uuidv4 } from 'uuid';

export class PaymentMethodId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): PaymentMethodId {
    return new PaymentMethodId(uuidv4());
  }

  public static from(value: string): PaymentMethodId {
    if (!value || value.trim().length === 0) {
      throw new Error('PaymentMethodId cannot be empty');
    }
    return new PaymentMethodId(value);
  }
}

export type PaymentMethodType = 'CREDIT_CARD' | 'DEBIT_CARD' | 'E_WALLET';

export interface PaymentMethodProps {
  id: PaymentMethodId;
  type: PaymentMethodType;
  provider: string;
  token: string;
  lastFourDigits: string;
  isDefault: boolean;
  expiryDate: Date | null;
  [key: string]: unknown;
}

export class PaymentMethod extends ValueObject<PaymentMethodProps> {
  private constructor(value: PaymentMethodProps) {
    super(value);
  }

  public static create(props: {
    type: PaymentMethodType;
    provider: string;
    token: string;
    lastFourDigits: string;
    expiryDate?: Date;
  }): Result<PaymentMethod, DomainError> {
    if (!props.type) {
      return Result.fail(new BusinessRuleViolationError('Payment method type is required'));
    }
    if (!props.provider || props.provider.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('Payment provider is required'));
    }
    if (!props.token || props.token.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('Payment token is required'));
    }
    if (!props.lastFourDigits || props.lastFourDigits.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('Last four digits are required'));
    }

    return Result.ok(new PaymentMethod({
      id: PaymentMethodId.create(),
      type: props.type,
      provider: props.provider,
      token: props.token,
      lastFourDigits: props.lastFourDigits,
      isDefault: false,
      expiryDate: props.expiryDate ?? null,
    }));
  }

  public static rehydrate(props: PaymentMethodProps): PaymentMethod {
    return new PaymentMethod(props);
  }

  public setAsDefault(): PaymentMethod {
    return new PaymentMethod({ ...this.props, isDefault: true });
  }

  public unsetDefault(): PaymentMethod {
    return new PaymentMethod({ ...this.props, isDefault: false });
  }

  get id(): PaymentMethodId {
    return this.props.id as PaymentMethodId;
  }

  get type(): PaymentMethodType {
    return this.props.type as PaymentMethodType;
  }

  get provider(): string {
    return this.props.provider as string;
  }

  get token(): string {
    return this.props.token as string;
  }

  get lastFourDigits(): string {
    return this.props.lastFourDigits as string;
  }

  get isDefault(): boolean {
    return this.props.isDefault as boolean;
  }

  get expiryDate(): Date | null {
    return this.props.expiryDate as Date | null;
  }

  protected getEqualityComponents(): unknown[] {
    return [this.props.id];
  }
}