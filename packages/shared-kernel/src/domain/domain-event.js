"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseDomainEvent = void 0;
const node_crypto_1 = require("node:crypto");
/**
 * Abstract Domain Event class.
 * Extend this to create concrete domain events.
 */
class BaseDomainEvent {
  eventId;
  eventType;
  aggregateId;
  occurredAt;
  aggregateVersion;
  correlationId;
  constructor(aggregateId, eventType, aggregateVersion = 1, correlationId) {
    this.eventId = (0, node_crypto_1.randomUUID)();
    this.eventType = eventType;
    this.aggregateId = aggregateId;
    this.occurredAt = new Date();
    this.aggregateVersion = aggregateVersion;
    this.correlationId = correlationId;
  }
  /**
   * Serialize the event to a plain object for publishing.
   */
  toJSON() {
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
exports.BaseDomainEvent = BaseDomainEvent;
//# sourceMappingURL=domain-event.js.map
