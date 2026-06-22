/**
 * Base Value Object class for Domain-Driven Design.
 * Value Objects are immutable and compared by their structural properties.
 * Two Value Objects are equal when all their properties are equal.
 */
export abstract class ValueObject<Props extends Record<string, unknown>> {
  protected readonly props: Props;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props } as Props);
  }

  public equals(other: ValueObject<Props>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (other.constructor !== this.constructor) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }

  public getProps(): Readonly<Props> {
    return this.props;
  }

  /**
   * Serialize the value object for persistence or transfer.
   * Override in subclasses for custom serialization logic.
   */
  public toJSON(): Record<string, unknown> {
    return { ...this.props };
  }
}
