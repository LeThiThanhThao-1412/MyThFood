import { Identifier } from './identifier';
/**
 * Base Entity class for Domain-Driven Design.
 * Entities are defined by their identity (ID), not their attributes.
 * Two entities are equal if they have the same ID.
 */
export declare abstract class Entity<T extends Identifier = Identifier> {
    protected readonly _id: T;
    private readonly _createdAt;
    private _updatedAt;
    protected constructor(id: T);
    get id(): T;
    get createdAt(): Date;
    get updatedAt(): Date;
    protected markUpdated(): void;
    equals(other: Entity<T>): boolean;
    /**
     * Check if the entity is new (no changes since creation).
     */
    isNew(): boolean;
}
//# sourceMappingURL=entity.d.ts.map