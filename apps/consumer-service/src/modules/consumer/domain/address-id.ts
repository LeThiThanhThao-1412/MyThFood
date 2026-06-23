import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuidv4 } from "uuid";

export class AddressId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): AddressId {
    return new AddressId(uuidv4());
  }

  public static from(value: string): AddressId {
    if (!value || value.trim().length === 0) {
      throw new Error("AddressId cannot be empty");
    }
    return new AddressId(value);
  }
}
