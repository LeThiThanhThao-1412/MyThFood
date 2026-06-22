import { Identifier } from './identifier';

/**
 * Base Entity class for Domain-Driven Design.
 * Entities are defined by their identity (ID), not their attributes.
 * Two entities are equal if they have the same ID.
 */
export abstract class Entity<T extends Identifier = Identifier> {
  protected readonly _id: T;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  protected constructor(id: T) {
    this._id = id;
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  get id(): T {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected markUpdated(): void {
    this._updatedAt = new Date();
  }

  public equals(other: Entity<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (!(other instanceof Entity)) {
      return false;
    }
    return this._id.equals(other._id);
  }

  /**
   * Check if the entity is new (no changes since creation).
   */
  public isNew(): boolean {
    return this._createdAt.getTime() === this._updatedAt.getTime();
  }
}