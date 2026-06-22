/**
 * CloudEvents specification base for all domain events.
 * Follows the CloudEvents 1.0 spec for interoperability.
 *
 * @see https://cloudevents.io/
 */
export interface CloudEvent<T = Record<string, unknown>> {
  /** Unique event identifier */
  id: string;

  /** Event type in reverse-DNS format: com.mythfood.identity.user.registered */
  type: string;

  /** The service that produced the event */
  source: string;

  /** CloudEvents spec version */
  specversion: '1.0';

  /** Timestamp in ISO 8601 format */
  time: string;

  /** The subject (aggregate ID) of the event */
  subject: string;

  /** Content type of data */
  datacontenttype: 'application/json';

  /** Correlation ID for distributed tracing */
  correlationid: string;

  /** Monotonically increasing sequence number */
  sequencenumber: number;

  /** The event payload */
  data: T;
}

/**
 * Factory for creating CloudEvent instances.
 */
export class CloudEventFactory {
  public static create<T>(params: {
    type: string;
    source: string;
    subject: string;
    data: T;
    correlationId?: string;
    sequenceNumber?: number;
  }): CloudEvent<T> {
    return {
      id: crypto.randomUUID?.() ?? CloudEventFactory.generateUUID(),
      type: params.type,
      source: params.source,
      specversion: '1.0',
      time: new Date().toISOString(),
      subject: params.subject,
      datacontenttype: 'application/json',
      correlationid: params.correlationId ?? crypto.randomUUID?.() ?? CloudEventFactory.generateUUID(),
      sequencenumber: params.sequenceNumber ?? 1,
      data: params.data,
    };
  }

  private static generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}