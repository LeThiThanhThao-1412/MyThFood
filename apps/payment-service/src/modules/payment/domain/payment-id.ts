import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuidv4 } from "uuid";

export class PaymentId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): PaymentId {
    return new PaymentId(uuidv4());
  }

  public static from(value: string): PaymentId {
    return new PaymentId(value);
  }
}
