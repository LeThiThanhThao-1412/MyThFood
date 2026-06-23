import {
  Entity as DomainEntity,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { MenuItemId } from "./menu-item-id";
import { MerchantId } from "./merchant-id";

export type MenuItemCategory =
  | "APPETIZER"
  | "MAIN_COURSE"
  | "DESSERT"
  | "BEVERAGE"
  | "DRINK"
  | "SIDE_DISH"
  | "COMBO"
  | "OTHER";

export interface MenuItemProps {
  id?: MenuItemId;
  merchantId: MerchantId;
  category: MenuItemCategory;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  preparationTime: number | null;
  sortOrder: number;
}

export class MenuItem extends DomainEntity<MenuItemId> {
  private merchantId: MerchantId;
  private category: MenuItemCategory;
  private name: string;
  private description: string | null;
  private price: number;
  private originalPrice: number | null;
  private imageUrl: string | null;
  private isAvailable: boolean;
  private isFeatured: boolean;
  private preparationTime: number | null;
  private sortOrder: number;

  private constructor(id: MenuItemId, props: MenuItemProps) {
    super(id);
    this.merchantId = props.merchantId;
    this.category = props.category;
    this.name = props.name;
    this.description = props.description;
    this.price = props.price;
    this.originalPrice = props.originalPrice;
    this.imageUrl = props.imageUrl;
    this.isAvailable = props.isAvailable;
    this.isFeatured = props.isFeatured;
    this.preparationTime = props.preparationTime;
    this.sortOrder = props.sortOrder;
  }

  public static create(props: {
    merchantId: MerchantId;
    category: MenuItemCategory;
    name: string;
    description?: string;
    price: number;
    originalPrice?: number;
    imageUrl?: string;
    isAvailable?: boolean;
    isFeatured?: boolean;
    preparationTime?: number;
    sortOrder?: number;
  }): MenuItem {
    return new MenuItem(MenuItemId.create(), {
      merchantId: props.merchantId,
      category: props.category,
      name: props.name,
      description: props.description ?? null,
      price: props.price,
      originalPrice: props.originalPrice ?? null,
      imageUrl: props.imageUrl ?? null,
      isAvailable: props.isAvailable ?? true,
      isFeatured: props.isFeatured ?? false,
      preparationTime: props.preparationTime ?? null,
      sortOrder: props.sortOrder ?? 0,
    });
  }

  public static rehydrate(id: MenuItemId, props: MenuItemProps): MenuItem {
    return new MenuItem(id, props);
  }

  /**
   * Update menu item properties.
   */
  public update(props: {
    category?: MenuItemCategory;
    name?: string;
    description?: string;
    price?: number;
    imageUrl?: string;
    isFeatured?: boolean;
    preparationTime?: number;
  }): void {
    if (props.name !== undefined) {
      if (!props.name.trim()) {
        throw new BusinessRuleViolationError("Menu item name cannot be empty");
      }
      this.name = props.name;
    }
    if (props.category !== undefined) this.category = props.category;
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

  get itemCategory(): MenuItemCategory {
    return this.category;
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
}
