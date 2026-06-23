import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuidv4 } from "uuid";

export class DriverId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): DriverId {
    return new DriverId(uuidv4());
  }

  public static from(value: string): DriverId {
    return new DriverId(value);
  }
}
