import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuidV4 } from "uuid";

export class DispatchId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): DispatchId {
    return new DispatchId(uuidV4());
  }

  public static from(value: string): DispatchId {
    return new DispatchId(value);
  }
}
