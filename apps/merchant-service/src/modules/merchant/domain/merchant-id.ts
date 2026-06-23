import { Identifier } from '@mythfood/shared-kernel';
import { v4 as uuidv4 } from 'uuid';

export class MerchantId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): MerchantId {
    return new MerchantId(uuidv4());
  }

  public static from(value: string): MerchantId {
    if (!value || value.trim().length === 0) {
      throw new Error('MerchantId cannot be empty');
    }
    return new MerchantId(value);
  }
}