import {
  Entity as DomainEntity,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { v4 as uuidv4 } from "uuid";
import { MenuItemId } from "./menu-item-id";
import { MerchantId } from "./merchant-id";

export type MenuItemOptionGroupType =
  | "CHOICE"
  | "MULTI_CHOICE"
  | "TOGGLE"
  | "QUANTITY";

export interface MenuItemOption {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  minQuantity: number | null;
  maxQuantity: number | null;
}

export interface MenuItemOptionGroup {
  id: string;
  name: string;
  type: MenuItemOptionGroupType;
  required: boolean;
  minSelections: number | null;
  maxSelections: number | null;
  options: MenuItemOption[];
}

export interface MenuItemProps {
  id?: MenuItemId;
  merchantId: MerchantId;
  category: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  preparationTime: number | null;
  sortOrder: number;
  optionGroups: MenuItemOptionGroup[];
}

export class MenuItem extends DomainEntity<MenuItemId> {
  private merchantId: MerchantId;
  private category: string;
  private categoryId: string | null;
  private name: string;
  private description: string | null;
  private price: number;
  private originalPrice: number | null;
  private imageUrl: string | null;
  private isAvailable: boolean;
  private isFeatured: boolean;
  private preparationTime: number | null;
  private sortOrder: number;
  private optionGroups: MenuItemOptionGroup[];

  private constructor(id: MenuItemId, props: MenuItemProps) {
    super(id);
    this.merchantId = props.merchantId;
    this.category = props.category;
    this.categoryId = props.categoryId ?? null;
    this.name = props.name;
    this.description = props.description;
    this.price = props.price;
    this.originalPrice = props.originalPrice;
    this.imageUrl = props.imageUrl;
    this.isAvailable = props.isAvailable;
    this.isFeatured = props.isFeatured;
    this.preparationTime = props.preparationTime;
    this.sortOrder = props.sortOrder;
    this.optionGroups = props.optionGroups ?? [];
  }

  public static create(props: {
    merchantId: MerchantId;
    category: string;
    categoryId?: string;
    name: string;
    description?: string;
    price: number;
    originalPrice?: number;
    imageUrl?: string;
    isAvailable?: boolean;
    isFeatured?: boolean;
    preparationTime?: number;
    sortOrder?: number;
    optionGroups?: MenuItemOptionGroup[];
  }): MenuItem {
    return new MenuItem(MenuItemId.create(), {
      merchantId: props.merchantId,
      category: props.category,
      categoryId: props.categoryId ?? null,
      name: props.name,
      description: props.description ?? null,
      price: props.price,
      originalPrice: props.originalPrice ?? null,
      imageUrl: props.imageUrl ?? null,
      isAvailable: props.isAvailable ?? true,
      isFeatured: props.isFeatured ?? false,
      preparationTime: props.preparationTime ?? null,
      sortOrder: props.sortOrder ?? 0,
      optionGroups: MenuItem.sanitizeOptionGroups(props.optionGroups),
    });
  }

  public static rehydrate(id: MenuItemId, props: MenuItemProps): MenuItem {
    return new MenuItem(id, props);
  }

  /**
   * Update menu item properties.
   */
  public update(props: {
    category?: string;
    categoryId?: string | null;
    name?: string;
    description?: string;
    price?: number;
    imageUrl?: string;
    isFeatured?: boolean;
    preparationTime?: number;
    optionGroups?: MenuItemOptionGroup[];
  }): void {
    if (props.name !== undefined) {
      if (!props.name.trim()) {
        throw new BusinessRuleViolationError("Menu item name cannot be empty");
      }
      this.name = props.name;
    }
    if (props.category !== undefined) this.category = props.category;
    if (props.categoryId !== undefined) this.categoryId = props.categoryId;
    if (props.description !== undefined) this.description = props.description;
    if (props.imageUrl !== undefined) this.imageUrl = props.imageUrl;
    if (props.isFeatured !== undefined) this.isFeatured = props.isFeatured;
    if (props.preparationTime !== undefined) {
      if (props.preparationTime < 0) {
        throw new BusinessRuleViolationError(
          "Preparation time cannot be negative",
        );
      }
      this.preparationTime = props.preparationTime;
    }

    // Track price change for audit
    if (props.price !== undefined) {
      if (props.price < 0) {
        throw new BusinessRuleViolationError("Price cannot be negative");
      }
      if (this.price !== props.price) {
        this.originalPrice = this.price;
        this.price = props.price;
      }
    }

    if (props.optionGroups !== undefined) {
      this.optionGroups = MenuItem.sanitizeOptionGroups(props.optionGroups);
    }
  }

  /**
   * Toggle availability.
   */
  public toggleAvailable(): void {
    this.isAvailable = !this.isAvailable;
  }

  /**
   * Mark as unavailable.
   */
  public markUnavailable(): void {
    this.isAvailable = false;
  }

  /**
   * Mark as available.
   */
  public markAvailable(): void {
    this.isAvailable = true;
  }

  // ===================== Getters =====================

  get menuItemId(): MenuItemId {
    return this.id;
  }

  get merchant(): MerchantId {
    return this.merchantId;
  }

  get itemCategory(): string {
    return this.category;
  }

  get itemCategoryId(): string | null {
    return this.categoryId;
  }

  get itemName(): string {
    return this.name;
  }

  get itemDescription(): string | null {
    return this.description;
  }

  get itemPrice(): number {
    return this.price;
  }

  get itemOriginalPrice(): number | null {
    return this.originalPrice;
  }

  get itemImageUrl(): string | null {
    return this.imageUrl;
  }

  get available(): boolean {
    return this.isAvailable;
  }

  get featured(): boolean {
    return this.isFeatured;
  }

  get prepTime(): number | null {
    return this.preparationTime;
  }

  get order(): number {
    return this.sortOrder;
  }

  get itemOptionGroups(): MenuItemOptionGroup[] {
    return this.optionGroups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o })),
    }));
  }

  /**
   * Validate and normalize option groups coming from the API/client.
   */
  public static sanitizeOptionGroups(
    groups?: MenuItemOptionGroup[],
  ): MenuItemOptionGroup[] {
    if (!groups || groups.length === 0) return [];
    return groups.map((g) => {
      if (!g.name || !g.name.trim()) {
        throw new BusinessRuleViolationError(
          "Option group name cannot be empty",
        );
      }
      const type = g.type;
      if (!["CHOICE", "MULTI_CHOICE", "TOGGLE", "QUANTITY"].includes(type)) {
        throw new BusinessRuleViolationError(
          `Invalid option group type: ${type}`,
        );
      }
      const options = (g.options || []).map((o) => {
        if (!o.name || !o.name.trim()) {
          throw new BusinessRuleViolationError("Option name cannot be empty");
        }
        return {
          id: o.id || uuidv4(),
          name: o.name,
          priceDelta: Number(o.priceDelta) || 0,
          isDefault: !!o.isDefault,
          minQuantity: o.minQuantity ?? null,
          maxQuantity: o.maxQuantity ?? null,
        };
      });
      if (options.length === 0) {
        throw new BusinessRuleViolationError(
          `Option group "${g.name}" must have at least one option`,
        );
      }
      return {
        id: g.id || uuidv4(),
        name: g.name,
        type,
        required: !!g.required,
        minSelections: g.minSelections ?? null,
        maxSelections: g.maxSelections ?? null,
        options,
      };
    });
  }
}
