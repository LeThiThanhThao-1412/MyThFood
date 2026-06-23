import { DomainEvent } from "./domain-event";
import { Entity } from "./entity";
import { Identifier } from "./identifier";
/**
 * Base Aggregate Root class for Domain-Driven Design.
 * Aggregate Roots are Entities that act as the entry point to an aggregate.
 * They are responsible for maintaining invariants and publishing domain events.
 */
export declare abstract class AggregateRoot<
  T extends Identifier = Identifier,
> extends Entity<T> {
  private _domainEvents;
  private _version;
  protected constructor(id: T);
  get version(): number;
  /**
   * Get all domain events and clear the internal collection.
   * This is typically called by the infrastructure layer after persisting the aggregate.
   */
  pullDomainEvents(): DomainEvent[];
  /**
   * Get domain events without clearing them (for inspection).
   */
  getDomainEvents(): ReadonlyArray<DomainEvent>;
  /**
   * Get the number of pending domain events.
   */
  get pendingEventCount(): number;
  /**
   * Record a domain event that happened within this aggregate.
   * Called by child entities or the aggregate itself.
   */
  protected addDomainEvent(event: DomainEvent): void;
  /**
   * Clear all pending domain events without processing.
   */
  protected clearDomainEvents(): void;
  /**
   * Check if the aggregate has any pending domain events.
   */
  hasUncommittedEvents(): boolean;
}
//# sourceMappingURL=aggregate-root.d.ts.map
