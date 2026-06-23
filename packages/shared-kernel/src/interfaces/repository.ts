import { Identifier } from "../domain/identifier";
import { AggregateRoot } from "../domain/aggregate-root";

/**
 * Generic Repository interface for Domain-Driven Design.
 * Provides basic CRUD operations for aggregate roots.
 */
export interface IRepository<
  T extends AggregateRoot,
  ID extends Identifier = Identifier,
> {
  /**
   * Save an aggregate (create or update).
   */
  save(aggregate: T): Promise<void>;

  /**
   * Find an aggregate by its ID.
   */
  findById(id: ID): Promise<T | null>;

  /**
   * Find an aggregate by its ID, throws if not found.
   */
  findByIdOrFail(id: ID): Promise<T>;

  /**
   * Check if an aggregate exists by ID.
   */
  exists(id: ID): Promise<boolean>;

  /**
   * Delete an aggregate.
   */
  delete(aggregate: T): Promise<void>;

  /**
   * Delete an aggregate by ID.
   */
  deleteById(id: ID): Promise<void>;
}

/**
 * Repository that supports finding by criteria.
 */
export interface IQueryableRepository<
  T extends AggregateRoot,
  ID extends Identifier = Identifier,
> extends IRepository<T, ID> {
  /**
   * Find all aggregates matching the criteria.
   */
  findAll(criteria?: Record<string, unknown>): Promise<T[]>;

  /**
   * Find one aggregate matching the criteria.
   */
  findOne(criteria: Record<string, unknown>): Promise<T | null>;

  /**
   * Count aggregates matching the criteria.
   */
  count(criteria?: Record<string, unknown>): Promise<number>;
}
