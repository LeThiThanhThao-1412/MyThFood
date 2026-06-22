import { DomainEvent } from './domain-event';
import { Entity } from './entity';
import { Identifier } from './identifier';

/**
 * Base Aggregate Root class for Domain-Driven Design.
 * Aggregate Roots are Entities that act as the entry point to an aggregate.
 * They are responsible for maintaining invariants and publishing domain events.
 */
export abstract class AggregateRoot<T extends Identifier = Identifier> extends Entity<T> {
  private _domainEvents: DomainEvent[] = [];
  private _version: number = 0;

  protected constructor(id: T) {
    super(id);
  }

  get version(): number {
    return this._version;
  }

  /**
   * Get all domain events and clear the internal collection.
   * This is typically called by the infrastructure layer after persisting the aggregate.
   */
  public pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  /**
   * Get domain events without clearing them (for inspection).
   */
  public getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this._domainEvents;
  }

  /**
   * Get the number of pending domain events.
   */
  public get pendingEventCount(): number {
    return this._domainEvents.length;
  }

  /**
   * Record a domain event that happened within this aggregate.
   * Called by child entities or the aggregate itself.
   */
  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
    this._version++;
    this.markUpdated();
  }

  /**
   * Clear all pending domain events without processing.
   */
  protected clearDomainEvents(): void {
    this._domainEvents = [];
  }

  /**
   * Check if the aggregate has any pending domain events.
   */
  public hasUncommittedEvents(): boolean {
    return this._domainEvents.length > 0;
  }
}