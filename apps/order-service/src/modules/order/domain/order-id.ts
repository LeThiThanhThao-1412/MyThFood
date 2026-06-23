import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuid } from "uuid";

export class OrderId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): OrderId {
    return new OrderId(uuid());
  }

  public static from(value: string): OrderId {
    return new OrderId(value);
  }
}
