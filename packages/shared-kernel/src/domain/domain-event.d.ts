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
export declare abstract class BaseDomainEvent implements DomainEvent {
    readonly eventId: string;
    readonly eventType: string;
    readonly aggregateId: Identifier;
    readonly occurredAt: Date;
    readonly aggregateVersion: number;
    readonly correlationId?: string;
    protected constructor(aggregateId: Identifier, eventType: string, aggregateVersion?: number, correlationId?: string);
    /**
     * Serialize the event to a plain object for publishing.
     */
    toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=domain-event.d.ts.map