import { Identifier } from '@mythfood/shared-kernel';
import { v4 as uuid } from 'uuid';

export class InventoryId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): InventoryId {
    return new InventoryId(uuid());
  }

  public static from(value: string): InventoryId {
    return new InventoryId(value);
  }
}