import { Identifier } from '@mythfood/shared-kernel';
import { v4 as uuidv4 } from 'uuid';

export class UserId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): UserId {
    return new UserId(uuidv4());
  }

  public static from(value: string): UserId {
    if (!value || value.trim().length === 0) {
      throw new Error('UserId cannot be empty');
    }
    return new UserId(value);
  }
}