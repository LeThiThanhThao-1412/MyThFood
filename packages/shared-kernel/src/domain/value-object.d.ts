/**
 * Base Value Object class for Domain-Driven Design.
 * Value Objects are immutable and compared by their structural properties.
 * Two Value Objects are equal when all their properties are equal.
 */
export declare abstract class ValueObject<
  Props extends Record<string, unknown>,
> {
  protected readonly props: Props;
  protected constructor(props: Props);
  equals(other: ValueObject<Props>): boolean;
  getProps(): Readonly<Props>;
  /**
   * Serialize the value object for persistence or transfer.
   * Override in subclasses for custom serialization logic.
   */
  toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=value-object.d.ts.map
