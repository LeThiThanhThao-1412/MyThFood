import { Entity as DomainEntity, Identifier, BusinessRuleViolationError } from '@mythfood/shared-kernel';
import { MerchantId } from './merchant-id';
import { v4 as uuidv4 } from 'uuid';

export class MerchantDocumentId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): MerchantDocumentId {
    return new MerchantDocumentId(uuidv4());
  }

  public static from(value: string): MerchantDocumentId {
    return new MerchantDocumentId(value);
  }
}

export type DocumentType = 'BUSINESS_LICENSE' | 'FOOD_SAFETY' | 'TAX';
export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface MerchantDocumentProps {
  id?: string;
  merchantId: MerchantId;
  type: string;
  url: string;
  status: DocumentStatus;
  verifiedAt: Date | null;
  [key: string]: unknown;
}

export class MerchantDocument extends DomainEntity<MerchantDocumentId> {
  private type: string;
  private url: string;
  private status: DocumentStatus;
  private verifiedAt: Date | null;

  private constructor(id: MerchantDocumentId, props: MerchantDocumentProps) {
    super(id);
    this.type = props.type;
    this.url = props.url;
    this.status = props.status;
    this.verifiedAt = props.verifiedAt;
  }

  public static create(props: {
    merchantId: MerchantId;
    type: string;
    url: string;
  }): MerchantDocument {
    return new MerchantDocument(MerchantDocumentId.create(), {
      merchantId: props.merchantId,
      type: props.type,
      url: props.url,
      status: 'PENDING',
      verifiedAt: null,
    });
  }

  public static rehydrate(id: MerchantDocumentId, props: MerchantDocumentProps): MerchantDocument {
    return new MerchantDocument(id, props);
  }

  /**
   * Verify the document (admin action).
   */
  public verify(): void {
    if (this.status === 'VERIFIED') {
      throw new BusinessRuleViolationError('Document is already verified');
    }
    this.status = 'VERIFIED';
    this.verifiedAt = new Date();
    this.markUpdated();
  }

  /**
   * Reject the document (admin action).
   */
  public reject(): void {
    if (this.status === 'VERIFIED') {
      throw new BusinessRuleViolationError('Cannot reject a verified document');
    }
    this.status = 'REJECTED';
    this.markUpdated();
  }

  // Getters
  get documentType(): string {
    return this.type;
  }

  get documentUrl(): string {
    return this.url;
  }

  get documentStatus(): DocumentStatus {
    return this.status;
  }

  get verifiedDate(): Date | null {
    return this.verifiedAt;
  }

  public isVerified(): boolean {
    return this.status === 'VERIFIED';
  }
}