"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateRoot = void 0;
const entity_1 = require("./entity");
/**
 * Base Aggregate Root class for Domain-Driven Design.
 * Aggregate Roots are Entities that act as the entry point to an aggregate.
 * They are responsible for maintaining invariants and publishing domain events.
 */
class AggregateRoot extends entity_1.Entity {
    _domainEvents = [];
    _version = 0;
    constructor(id) {
        super(id);
    }
    get version() {
        return this._version;
    }
    /**
     * Get all domain events and clear the internal collection.
     * This is typically called by the infrastructure layer after persisting the aggregate.
     */
    pullDomainEvents() {
        const events = [...this._domainEvents];
        this._domainEvents = [];
        return events;
    }
    /**
     * Get domain events without clearing them (for inspection).
     */
    getDomainEvents() {
        return this._domainEvents;
    }
    /**
     * Get the number of pending domain events.
     */
    get pendingEventCount() {
        return this._domainEvents.length;
    }
    /**
     * Record a domain event that happened within this aggregate.
     * Called by child entities or the aggregate itself.
     */
    addDomainEvent(event) {
        this._domainEvents.push(event);
        this._version++;
        this.markUpdated();
    }
    /**
     * Clear all pending domain events without processing.
     */
    clearDomainEvents() {
        this._domainEvents = [];
    }
    /**
     * Check if the aggregate has any pending domain events.
     */
    hasUncommittedEvents() {
        return this._domainEvents.length > 0;
    }
}
exports.AggregateRoot = AggregateRoot;
//# sourceMappingURL=aggregate-root.js.map