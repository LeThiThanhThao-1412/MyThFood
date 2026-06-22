import { ValueObject, BusinessRuleViolationError, Result, DomainError } from '@mythfood/shared-kernel';
import { AddressId } from './address-id';

export interface GpsCoordinatesProps {
  latitude: number;
  longitude: number;
  [key: string]: unknown;
}

export class GpsCoordinates extends ValueObject<GpsCoordinatesProps> {
  private constructor(value: GpsCoordinatesProps) {
    super(value);
  }

  public static create(latitude: number, longitude: number): Result<GpsCoordinates, DomainError> {
    if (latitude < -90 || latitude > 90) {
      return Result.fail(new BusinessRuleViolationError('Latitude must be between -90 and 90'));
    }
    if (longitude < -180 || longitude > 180) {
      return Result.fail(new BusinessRuleViolationError('Longitude must be between -180 and 180'));
    }
    return Result.ok(new GpsCoordinates({ latitude, longitude }));
  }

  public static from(value: GpsCoordinatesProps): GpsCoordinates {
    return new GpsCoordinates(value);
  }

  get latitude(): number {
    return this.props.latitude as number;
  }

  get longitude(): number {
    return this.props.longitude as number;
  }

  protected getEqualityComponents(): unknown[] {
    return [this.props.latitude, this.props.longitude];
  }
}

export type AddressType = 'HOME' | 'WORK' | 'OTHER';

export interface AddressProps {
  id: AddressId;
  label: string;
  fullAddress: string;
  city: string;
  district: string;
  ward: string;
  street: string;
  gps: GpsCoordinates | null;
  type: AddressType;
  isDefault: boolean;
  [key: string]: unknown;
}

export class Address extends ValueObject<AddressProps> {
  private constructor(value: AddressProps) {
    super(value);
  }

  public static create(props: {
    label: string;
    fullAddress: string;
    city: string;
    district: string;
    ward: string;
    street: string;
    gps?: GpsCoordinates;
    type?: AddressType;
  }): Result<Address, DomainError> {
    if (!props.label || props.label.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('Address label is required'));
    }
    if (!props.fullAddress || props.fullAddress.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('Full address is required'));
    }
    if (!props.city || props.city.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('City is required'));
    }

    return Result.ok(new Address({
      id: AddressId.create(),
      label: props.label,
      fullAddress: props.fullAddress,
      city: props.city,
      district: props.district,
      ward: props.ward,
      street: props.street,
      gps: props.gps ?? null,
      type: props.type ?? 'HOME',
      isDefault: false,
    }));
  }

  public static rehydrate(props: AddressProps): Address {
    return new Address(props);
  }

  public setAsDefault(): Address {
    return new Address({ ...this.props, isDefault: true });
  }

  public unsetDefault(): Address {
    return new Address({ ...this.props, isDefault: false });
  }

  public updateLabel(label: string): Result<Address, DomainError> {
    if (!label || label.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError('Address label is required'));
    }
    return Result.ok(new Address({ ...this.props, label }));
  }

  // Getters
  get id(): AddressId {
    return this.props.id as AddressId;
  }

  get label(): string {
    return this.props.label as string;
  }

  get fullAddress(): string {
    return this.props.fullAddress as string;
  }

  get city(): string {
    return this.props.city as string;
  }

  get district(): string {
    return this.props.district as string;
  }

  get ward(): string {
    return this.props.ward as string;
  }

  get street(): string {
    return this.props.street as string;
  }

  get gps(): GpsCoordinates | null {
    return this.props.gps as GpsCoordinates | null;
  }

  get type(): AddressType {
    return this.props.type as AddressType;
  }

  get isDefault(): boolean {
    return this.props.isDefault as boolean;
  }

  protected getEqualityComponents(): unknown[] {
    return [this.props.id];
  }
}