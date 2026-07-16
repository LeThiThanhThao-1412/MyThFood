import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuidv4 } from "uuid";

export class WalletId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): WalletId {
    return new WalletId(uuidv4());
  }

  public static from(value: string): WalletId {
    return new WalletId(value);
  }
}
