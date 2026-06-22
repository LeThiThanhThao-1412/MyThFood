// Domain building blocks
export { Identifier } from './domain/identifier';
export { ValueObject } from './domain/value-object';
export { Entity } from './domain/entity';
export { AggregateRoot } from './domain/aggregate-root';
export type { DomainEvent } from './domain/domain-event';
export { BaseDomainEvent } from './domain/domain-event';
export { Result } from './domain/result';
export {
  DomainError,
  EntityNotFoundError,
  BusinessRuleViolationError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from './domain/domain-error';

// Interfaces
export type { IRepository, IQueryableRepository } from './interfaces/repository';
export type { IEventBus, IEventSubscriber } from './interfaces/event-bus';
export type { IUnitOfWork } from './interfaces/unit-of-work';
export type { ICache } from './interfaces/cache';