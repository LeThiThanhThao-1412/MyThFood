import { AggregateRoot } from "../domain/aggregate-root";
import { Identifier } from "../domain/identifier";
import { IRepository } from "./repository";
/**
 * Unit of Work pattern for managing transactions across multiple repositories.
 * Ensures all changes are committed atomically and domain events are published.
 */
export interface IUnitOfWork {
  /**
   * Begin a new transaction.
   */
  begin(): Promise<void>;
  /**
   * Commit the current transaction and publish all domain events.
   */
  commit(): Promise<void>;
  /**
   * Rollback the current transaction.
   */
  rollback(): Promise<void>;
  /**
   * Execute work within a transaction. Publishes events on success, rolls back on failure.
   */
  execute<T>(work: () => Promise<T>): Promise<T>;
  /**
   * Register an aggregate for tracking in this unit of work.
   */
  register(aggregate: AggregateRoot): void;
  /**
   * Get a repository instance for the given aggregate type.
   */
  getRepository<T extends AggregateRoot, ID extends Identifier>(
    aggregateClass: new (...args: unknown[]) => T,
  ): IRepository<T, ID>;
}
//# sourceMappingURL=unit-of-work.d.ts.map
