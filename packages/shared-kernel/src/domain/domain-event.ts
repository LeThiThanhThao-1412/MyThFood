import { randomUUID } from 'node:crypto';
import { Identifier } from './identifier';

/**
 * Base Domain Event interface for Domain-Driven Design.
 * Domain Events represent something significant that happened in the domain.
 */
export interface DomainEvent {
  /** Unique event identifier */
  readonly eventId: string;

  /** The type/name of the event */
  readonly eventType: string;

  /** The aggregate ID that produced this event */
  readonly aggregateId: Identifier;

  /** Timestamp when the event occurred */
  readonly occurredAt: Date;

  /** The version of the aggregate at the time of this event */
  readonly aggregateVersion: number;

  /** Correlation ID for tracing across services */
  readonly correlationId?: string;
}

/**
 * Abstract Domain Event class.
 * Extend this to create concrete domain events.
 */
export abstract class BaseDomainEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly eventType: string;
  public readonly aggregateId: Identifier;
  public readonly occurredAt: Date;
  public readonly aggregateVersion: number;
  public readonly correlationId?: string;

  protected constructor(
    aggregateId: Identifier,
    eventType: string,
    aggregateVersion: number = 1,
    correlationId?: string,
  ) {
    this.eventId = randomUUID();
    this.eventType = eventType;
    this.aggregateId = aggregateId;
    this.occurredAt = new Date();
    this.aggregateVersion = aggregateVersion;
    this.correlationId = correlationId;
  }

  /**
   * Serialize the event to a plain object for publishing.
   */
  public toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId.toString(),
      occurredAt: this.occurredAt.toISOString(),
      aggregateVersion: this.aggregateVersion,
      correlationId: this.correlationId,
    };
  }

}