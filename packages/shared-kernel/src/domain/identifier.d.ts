/**
 * Base Identifier class for Domain-Driven Design.
 * All domain identifiers should extend this class.
 * Uses UUIDs by default for distributed-safe identity.
 */
export declare abstract class Identifier<T extends number | string = string> {
    private readonly _value;
    protected constructor(value: T);
    get value(): T;
    equals(other: Identifier<T>): boolean;
    toString(): string;
    toValue(): T;
}
//# sourceMappingURL=identifier.d.ts.map