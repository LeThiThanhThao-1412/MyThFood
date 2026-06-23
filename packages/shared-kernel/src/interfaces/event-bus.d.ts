import { DomainEvent } from '../domain/domain-event';
/**
 * Interface for publishing domain events to the message broker.
 */
export interface IEventBus {
    /**
     * Publish a single domain event.
     */
    publish<T extends DomainEvent>(event: T): Promise<void>;
    /**
     * Publish multiple domain events in batch.
     */
    publishBatch<T extends DomainEvent>(events: T[]): Promise<void>;
}
/**
 * Interface for subscribing to domain events.
 */
export interface IEventSubscriber<T extends DomainEvent = DomainEvent> {
    /**
     * Handle a domain event.
     */
    handle(event: T): Promise<void>;
    /**
     * The event type(s) this subscriber handles.
     */
    eventTypes(): string[];
}
//# sourceMappingURL=event-bus.d.ts.map