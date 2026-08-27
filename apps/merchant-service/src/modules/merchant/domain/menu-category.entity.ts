import { v4 as uuidv4 } from "uuid";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";

/**
 * Danh mục món ăn do nhà hàng tự quản lý (VD: Trà sữa, Trà trái cây, Nước ép...).
 */
export class MenuCategory {
  private constructor(
    public readonly id: string,
    public readonly merchantId: string,
    private _name: string,
    private _sortOrder: number,
  ) {}

  public static create(props: {
    merchantId: string;
    name: string;
    sortOrder?: number;
  }): MenuCategory {
    const name = props.name?.trim();
    if (!name) {
      throw new BusinessRuleViolationError(
        "Menu category name cannot be empty",
      );
    }
    return new MenuCategory(
      uuidv4(),
      props.merchantId,
      name,
      props.sortOrder ?? 0,
    );
  }

  public static rehydrate(props: {
    id: string;
    merchantId: string;
    name: string;
    sortOrder: number;
  }): MenuCategory {
    return new MenuCategory(
      props.id,
      props.merchantId,
      props.name,
      props.sortOrder,
    );
  }

  public updateName(name: string): void {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new BusinessRuleViolationError(
        "Menu category name cannot be empty",
      );
    }
    this._name = trimmed;
  }

  public updateSortOrder(sortOrder: number): void {
    if (sortOrder < 0) {
      throw new BusinessRuleViolationError("Sort order cannot be negative");
    }
    this._sortOrder = sortOrder;
  }

  get name(): string {
    return this._name;
  }

  get sortOrder(): number {
    return this._sortOrder;
  }
}
