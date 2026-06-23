import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuidv4 } from "uuid";

export class ConsumerId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): ConsumerId {
    return new ConsumerId(uuidv4());
  }

  public static from(value: string): ConsumerId {
    if (!value || value.trim().length === 0) {
      throw new Error("ConsumerId cannot be empty");
    }
    return new ConsumerId(value);
  }
}
