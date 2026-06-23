# @mythfood/shared-kernel

Domain-Driven Design building blocks for MyThFood microservices.

## Purpose

This package provides the foundational DDD primitives used across all services:

- **Identifier**: Base class for strongly-typed domain IDs
- **ValueObject**: Immutable value objects compared by structural equality
- **Entity**: Objects with identity, compared by ID
- **AggregateRoot**: Entity that acts as transactional boundary, manages domain events
- **DomainEvent**: Significant domain occurrences for event-driven architecture
- **Result<T, E>**: Monadic error handling without throwing exceptions
- **DomainError**: Typed domain errors with HTTP status codes

## Interfaces

- **IRepository**: CRUD operations for aggregate roots
- **IEventBus**: Publish domain events to message broker
- **IEventSubscriber**: Subscribe to domain events
- **IUnitOfWork**: Transactional boundary for repositories
- **ICache**: Distributed caching abstraction

## Usage

```typescript
import {
  Identifier,
  ValueObject,
  Entity,
  AggregateRoot,
  Result,
  DomainError,
  IRepository,
} from "@mythfood/shared-kernel";

// Create a strongly-typed ID
class UserId extends Identifier {
  private constructor(value: string) {
    super(value);
  }

  public static create(): UserId {
    return new UserId(crypto.randomUUID());
  }

  public static from(value: string): UserId {
    return new UserId(value);
  }
}

// Create a Value Object
interface PhoneNumberProps {
  countryCode: string;
  number: string;
}
class PhoneNumber extends ValueObject<PhoneNumberProps> {
  public static create(
    props: PhoneNumberProps,
  ): Result<PhoneNumber, DomainError> {
    if (!/^\d{10}$/.test(props.number)) {
      return Result.fail(new ValidationError("Invalid phone number"));
    }
    return Result.ok(new PhoneNumber(props));
  }
}

// Create an Aggregate Root
class User extends AggregateRoot<UserId> {
  private phoneNumber: PhoneNumber;
  private status: "ACTIVE" | "INACTIVE";

  public static register(phoneNumber: PhoneNumber): Result<User, DomainError> {
    const user = new User(UserId.create());
    user.phoneNumber = phoneNumber;
    user.status = "ACTIVE";
    user.addDomainEvent(new UserRegisteredEvent(user.id));
    return Result.ok(user);
  }
}
```
