import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuid } from "uuid";

export class PenaltyId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): PenaltyId {
    return new PenaltyId(uuid());
  }

  public static from(value: string): PenaltyId {
    return new PenaltyId(value);
  }
}
