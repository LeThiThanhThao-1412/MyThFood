/**
 * Base Identifier class for Domain-Driven Design.
 * All domain identifiers should extend this class.
 * Uses UUIDs by default for distributed-safe identity.
 */
export abstract class Identifier<T extends number | string = string> {
  private readonly _value: T;

  protected constructor(value: T) {
    this._value = value;
  }

  get value(): T {
    return this._value;
  }

  public equals(other: Identifier<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (!(other instanceof Identifier)) {
      return false;
    }
    return this._value === other._value;
  }

  public toString(): string {
    return String(this._value);
  }

  public toValue(): T {
    return this._value;
  }
}