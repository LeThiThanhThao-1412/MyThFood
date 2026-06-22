# @mythfood/event-contracts

Domain Event contract definitions for MyThFood microservices. All events follow the [CloudEvents 1.0](https://cloudevents.io/) specification.

## Purpose

This package provides strictly-typed event contracts shared across all services:

- **CloudEvent<T>**: Base event envelope following CloudEvents spec
- **Identity Events**: UserRegistered, UserLoggedIn, etc.
- More event domains will be added as services are built

## Event Structure

Every event follows this envelope:

```typescript
{
  id: string;              // Unique event ID
  type: string;            // Reverse-DNS type: com.mythfood.identity.user.registered
  source: string;          // Service name: /identity-service
  specversion: "1.0";      // CloudEvents spec version
  time: string;            // ISO 8601 timestamp
  subject: string;         // Aggregate ID
  datacontenttype: "application/json";
  correlationid: string;   // Distributed tracing ID
  sequencenumber: number;  // Monotonic sequence number
  data: T;                 // Event-specific payload
}
```

## Identity Events

| Event Type | Kafka Topic | Description |
|---|---|---|
| `com.mythfood.identity.user.registered` | identity.events | New user registration |
| `com.mythfood.identity.user.logged_in` | identity.events | User successful login |

## Usage

```typescript
import {
  CloudEventFactory,
  UserRegisteredEventData,
  USER_REGISTERED_EVENT_TYPE,
} from '@mythfood/event-contracts';

const event = CloudEventFactory.create<UserRegisteredEventData>({
  type: USER_REGISTERED_EVENT_TYPE,
  source: '/identity-service',
  subject: 'user-123',
  data: {
    userId: 'user-123',
    phoneNumber: '+84901234567',
    fullName: 'Nguyen Van A',
    roles: ['CONSUMER'],
  },
});