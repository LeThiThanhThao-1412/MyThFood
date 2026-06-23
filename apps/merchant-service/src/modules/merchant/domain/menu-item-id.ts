import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuidv4 } from "uuid";

export class MenuItemId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): MenuItemId {
    return new MenuItemId(uuidv4());
  }

  public static from(value: string): MenuItemId {
    if (!value || value.trim().length === 0) {
      throw new Error("MenuItemId cannot be empty");
    }
    return new MenuItemId(value);
  }
}
