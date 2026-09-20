import { Identifier } from "@mythfood/shared-kernel";
import { v4 as uuid } from "uuid";

export class CaseId extends Identifier<string> {
  private constructor(value: string) {
    super(value);
  }

  public static create(): CaseId {
    return new CaseId(uuid());
  }

  public static from(value: string): CaseId {
    return new CaseId(value);
  }
}
