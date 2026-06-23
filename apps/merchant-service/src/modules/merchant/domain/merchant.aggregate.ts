import {
  AggregateRoot,
  Result,
  DomainError,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { MerchantId } from "./merchant-id";
import { MerchantRegisteredEvent } from "./events/merchant-registered.event";
import { MenuItem, MenuItemCategory } from "./menu-item.entity";
import { MenuItemId } from "./menu-item-id";
import { OperatingHours, OperatingHoursProps } from "./operating-hours.vo";
import { MerchantDocument } from "./merchant-document.entity";
import { MenuUpdatedEvent } from "./events/menu-updated.event";

export type MerchantStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type CapacityStatus = "NORMAL" | "BUSY" | "OVERLOADED" | "CRITICAL";

export interface CapacityConfig {
  maxConcurrentOrders: number;
  prepTimePerOrder: number; // minutes
}

export interface MerchantProps {
  userId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  phone: string;
  email: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  status: MerchantStatus;
  rating: number;
  totalOrders: number;
  capacityConfig: CapacityConfig;
  capacityStatus: CapacityStatus;
  menuItems: MenuItem[];
  operatingHours: OperatingHours[];
  documents: MerchantDocument[];
  currentOrderCount: number;
}

export class Merchant extends AggregateRoot<MerchantId> {
  private userId: string;
  private name: string;
  private description: string | null;
  private logoUrl: string | null;
  private coverImageUrl: string | null;
  private phone: string;
  private email: string | null;
  private address: string;
  private latitude: number | null;
  private longitude: number | null;
  private status: MerchantStatus;
  private rating: number;
  private totalOrders: number;
  private capacityConfig: CapacityConfig;
  private capacityStatus: CapacityStatus;
  private menuItems: MenuItem[];
  private operatingHours: OperatingHours[];
  private documents: MerchantDocument[];
  private currentOrderCount: number;

  private constructor(id: MerchantId, props: MerchantProps) {
    super(id);
    this.userId = props.userId;
    this.name = props.name;
    this.description = props.description;
    this.logoUrl = props.logoUrl;
    this.coverImageUrl = props.coverImageUrl;
    this.phone = props.phone;
    this.email = props.email;
    this.address = props.address;
    this.latitude = props.latitude;
    this.longitude = props.longitude;
    this.status = props.status;
    this.rating = props.rating;
    this.totalOrders = props.totalOrders;
    this.capacityConfig = props.capacityConfig;
    this.capacityStatus = props.capacityStatus;
    this.menuItems = props.menuItems;
    this.operatingHours = props.operatingHours;
    this.documents = props.documents;
    this.currentOrderCount = props.currentOrderCount;
  }

  // ===================== Factory Methods =====================

  /**
   * Register a new merchant (onboarding step 1).
   */
  public static register(props: {
    userId: string;
    name: string;
    phone: string;
    address: string;
    email?: string;
    description?: string;
    latitude?: number;
    longitude?: number;
    capacityConfig?: CapacityConfig;
  }): Result<Merchant, DomainError> {
    if (!props.name || props.name.trim().length === 0) {
      return Result.fail(
        new BusinessRuleViolationError("Merchant name is required"),
      );
    }
    if (!props.phone || props.phone.trim().length === 0) {
      return Result.fail(
        new BusinessRuleViolationError("Phone number is required"),
      );
    }
    if (!props.address || props.address.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError("Address is required"));
    }
    if (!props.userId || props.userId.trim().length === 0) {
      return Result.fail(new BusinessRuleViolationError("User ID is required"));
    }

    const defaultCapacity: CapacityConfig = {
      maxConcurrentOrders: props.capacityConfig?.maxConcurrentOrders ?? 10,
      prepTimePerOrder: props.capacityConfig?.prepTimePerOrder ?? 20,
    };

    const merchant = new Merchant(MerchantId.create(), {
      userId: props.userId,
      name: props.name,
      description: props.description ?? null,
      logoUrl: null,
      coverImageUrl: null,
      phone: props.phone,
      email: props.email ?? null,
      address: props.address,
      latitude: props.latitude ?? null,
      longitude: props.longitude ?? null,
      status: "PENDING",
      rating: 0,
      totalOrders: 0,
      capacityConfig: defaultCapacity,
      capacityStatus: "NORMAL",
      menuItems: [],
      operatingHours: [],
      documents: [],
      currentOrderCount: 0,
    });

    merchant.addDomainEvent(
      new MerchantRegisteredEvent(merchant.id, {
        merchantId: merchant.id.toString(),
        userId: props.userId,
        name: props.name,
        email: props.email ?? null,
        phone: props.phone,
        address: props.address,
        status: "PENDING",
      }),
    );

    return Result.ok(merchant);
  }

  /**
   * Rehydrate a Merchant from persistence (no events emitted).
   */
  public static rehydrate(id: MerchantId, props: MerchantProps): Merchant {
    return new Merchant(id, props);
  }

  // ===================== Merchant Management =====================

  /**
   * Update merchant information.
   */
  public updateInfo(props: {
    name?: string;
    description?: string;
    phone?: string;
    email?: string;
    address?: string;
    logoUrl?: string;
    coverImageUrl?: string;
    latitude?: number;
    longitude?: number;
  }): void {
    if (props.name !== undefined) {
      if (!props.name.trim()) {
        throw new BusinessRuleViolationError("Merchant name cannot be empty");
      }
      this.name = props.name;
    }
    if (props.description !== undefined) this.description = props.description;
    if (props.phone !== undefined) {
      if (!props.phone.trim()) {
        throw new BusinessRuleViolationError("Phone cannot be empty");
      }
      this.phone = props.phone;
    }
    if (props.email !== undefined) this.email = props.email;
    if (props.address !== undefined) {
      if (!props.address.trim()) {
        throw new BusinessRuleViolationError("Address cannot be empty");
      }
      this.address = props.address;
    }
    if (props.logoUrl !== undefined) this.logoUrl = props.logoUrl;
    if (props.coverImageUrl !== undefined)
      this.coverImageUrl = props.coverImageUrl;
    if (props.latitude !== undefined) this.latitude = props.latitude;
    if (props.longitude !== undefined) this.longitude = props.longitude;
    this.markUpdated();
  }

  /**
   * Approve the merchant (admin action).
   */
  public approve(): void {
    if (this.status === "APPROVED") {
      throw new BusinessRuleViolationError("Merchant is already approved");
    }
    if (this.status === "SUSPENDED") {
      throw new BusinessRuleViolationError(
        "Cannot approve a suspended merchant. Reactivate first.",
      );
    }
    this.status = "APPROVED";
    this.markUpdated();
  }

  /**
   * Reject the merchant (admin action).
   */
  public reject(): void {
    if (this.status === "APPROVED") {
      throw new BusinessRuleViolationError(
        "Cannot reject an approved merchant",
      );
    }
    this.status = "REJECTED";
    this.markUpdated();
  }

  /**
   * Suspend the merchant.
   */
  public suspend(): void {
    if (this.status === "SUSPENDED") {
      throw new BusinessRuleViolationError("Merchant is already suspended");
    }
    if (this.status === "REJECTED") {
      throw new BusinessRuleViolationError(
        "Cannot suspend a rejected merchant",
      );
    }
    this.status = "SUSPENDED";
    this.markUpdated();
  }

  /**
   * Reactivate a suspended merchant.
   */
  public reactivate(): void {
    if (this.status !== "SUSPENDED") {
      throw new BusinessRuleViolationError(
        "Only suspended merchants can be reactivated",
      );
    }
    this.status = "APPROVED";
    this.markUpdated();
  }

  // ===================== Menu Management =====================

  /**
   * Add a menu item to the merchant.
   */
  public addMenuItem(props: {
    category: MenuItemCategory;
    name: string;
    description?: string;
    price: number;
    imageUrl?: string;
    isFeatured?: boolean;
    preparationTime?: number;
  }): MenuItem {
    if (!props.name || props.name.trim().length === 0) {
      throw new BusinessRuleViolationError("Menu item name is required");
    }
    if (props.price < 0) {
      throw new BusinessRuleViolationError("Price cannot be negative");
    }

    const menuItem = MenuItem.create({
      merchantId: this.id,
      category: props.category,
      name: props.name,
      description: props.description,
      price: props.price,
      imageUrl: props.imageUrl,
      isFeatured: props.isFeatured,
      preparationTime: props.preparationTime,
      sortOrder: this.menuItems.length,
    });

    this.menuItems.push(menuItem);
    this.markUpdated();

    this.addDomainEvent(
      new MenuUpdatedEvent(this.id, {
        merchantId: this.id.toString(),
        menuItemId: menuItem.id.toString(),
        name: props.name,
        price: props.price,
        isAvailable: true,
        action: "CREATED",
      }),
    );

    return menuItem;
  }

  /**
   * Update a menu item.
   */
  public updateMenuItem(
    menuItemId: MenuItemId,
    props: {
      category?: MenuItemCategory;
      name?: string;
      description?: string;
      price?: number;
      imageUrl?: string;
      isFeatured?: boolean;
      preparationTime?: number;
    },
  ): MenuItem {
    const menuItem = this.findMenuItemOrThrow(menuItemId);
    const oldPrice = menuItem.itemPrice;

    menuItem.update(props);

    if (props.price !== undefined && props.price !== oldPrice) {
      this.addDomainEvent(
        new MenuUpdatedEvent(this.id, {
          merchantId: this.id.toString(),
          menuItemId: menuItemId.toString(),
          name: menuItem.itemName,
          price: props.price,
          isAvailable: menuItem.available,
          action: "PRICE_CHANGED",
          oldPrice,
          newPrice: props.price,
        }),
      );
    }

    this.markUpdated();
    return menuItem;
  }

  /**
   * Toggle menu item availability.
   */
  public toggleMenuItem(menuItemId: MenuItemId): MenuItem {
    const menuItem = this.findMenuItemOrThrow(menuItemId);
    menuItem.toggleAvailable();

    this.addDomainEvent(
      new MenuUpdatedEvent(this.id, {
        merchantId: this.id.toString(),
        menuItemId: menuItemId.toString(),
        name: menuItem.itemName,
        price: menuItem.itemPrice,
        isAvailable: menuItem.available,
        action: "TOGGLED",
      }),
    );

    this.markUpdated();
    return menuItem;
  }

  /**
   * Remove a menu item (soft delete from the aggregate list).
   */
  public removeMenuItem(menuItemId: MenuItemId): void {
    const menuItem = this.findMenuItemOrThrow(menuItemId);
    this.menuItems = this.menuItems.filter((mi) => !mi.id.equals(menuItemId));

    this.addDomainEvent(
      new MenuUpdatedEvent(this.id, {
        merchantId: this.id.toString(),
        menuItemId: menuItemId.toString(),
        name: menuItem.itemName,
        price: menuItem.itemPrice,
        isAvailable: menuItem.available,
        action: "DELETED",
      }),
    );

    this.markUpdated();
  }

  private findMenuItemOrThrow(menuItemId: MenuItemId): MenuItem {
    const menuItem = this.menuItems.find((mi) => mi.id.equals(menuItemId));
    if (!menuItem) {
      throw new BusinessRuleViolationError(
        `Menu item ${menuItemId.toString()} not found`,
      );
    }
    return menuItem;
  }

  // ===================== Operating Hours =====================

  /**
   * Set operating hours for specific day or special date.
   */
  public setOperatingHours(hours: OperatingHoursProps[]): void {
    if (hours.length === 0) {
      throw new BusinessRuleViolationError("Operating hours cannot be empty");
    }
    this.operatingHours = hours.map((h) => OperatingHours.create(h));
    this.markUpdated();
  }

  /**
   * Check if the merchant is currently open.
   */
  public isOpen(now: Date = new Date()): boolean {
    if (this.status !== "APPROVED") return false;

    const todayHours = this.getTodayHours(now);
    if (!todayHours) return false;
    if (todayHours.isClosed) return false;

    return todayHours.isWithinOperatingHours(now);
  }

  private getTodayHours(now: Date): OperatingHours | undefined {
    // First check for special date
    const dateStr = now.toISOString().split("T")[0];
    const specialHours = this.operatingHours.find(
      (oh) => oh.specialDate === dateStr,
    );
    if (specialHours) return specialHours;

    // Fall back to day of week
    const dayOfWeek = now.getDay();
    return this.operatingHours.find((oh) => oh.dayOfWeek === dayOfWeek);
  }

  // ===================== Capacity Management =====================

  /**
   * Update capacity configuration.
   */
  public updateCapacityConfig(config: {
    maxConcurrentOrders?: number;
    prepTimePerOrder?: number;
  }): void {
    if (config.maxConcurrentOrders !== undefined) {
      if (config.maxConcurrentOrders < 1) {
        throw new BusinessRuleViolationError(
          "Max concurrent orders must be at least 1",
        );
      }
      this.capacityConfig.maxConcurrentOrders = config.maxConcurrentOrders;
    }
    if (config.prepTimePerOrder !== undefined) {
      if (config.prepTimePerOrder < 1) {
        throw new BusinessRuleViolationError(
          "Prep time must be at least 1 minute",
        );
      }
      this.capacityConfig.prepTimePerOrder = config.prepTimePerOrder;
    }
    this.recalculateCapacity();
    this.markUpdated();
  }

  /**
   * Increment order count (called when a new order is placed).
   */
  public incrementOrderCount(): void {
    this.currentOrderCount++;
    this.recalculateCapacity();
    this.markUpdated();
  }

  /**
   * Decrement order count (called when an order is completed/cancelled).
   */
  public decrementOrderCount(): void {
    if (this.currentOrderCount > 0) {
      this.currentOrderCount--;
    }
    this.recalculateCapacity();
    this.markUpdated();
  }

  private recalculateCapacity(): void {
    const ratio =
      this.currentOrderCount / this.capacityConfig.maxConcurrentOrders;
    if (ratio >= 1.0) {
      this.capacityStatus = "CRITICAL";
    } else if (ratio >= 0.8) {
      this.capacityStatus = "OVERLOADED";
    } else if (ratio >= 0.6) {
      this.capacityStatus = "BUSY";
    } else {
      this.capacityStatus = "NORMAL";
    }
  }

  // ===================== Document Management =====================

  /**
   * Add a legal document to the merchant.
   */
  public addDocument(props: { type: string; url: string }): MerchantDocument {
    const doc = MerchantDocument.create({
      merchantId: this.id,
      type: props.type,
      url: props.url,
    });
    this.documents.push(doc);
    this.markUpdated();
    return doc;
  }

  /**
   * Verify a document (admin action).
   */
  public verifyDocument(documentId: string): void {
    const doc = this.documents.find((d) => d.id.toString() === documentId);
    if (!doc) {
      throw new BusinessRuleViolationError("Document not found");
    }
    doc.verify();
    this.markUpdated();
  }

  // ===================== Getters =====================

  get ownerId(): string {
    return this.userId;
  }

  get merchantName(): string {
    return this.name;
  }

  get merchantDescription(): string | null {
    return this.description;
  }

  get merchantLogoUrl(): string | null {
    return this.logoUrl;
  }

  get merchantCoverImageUrl(): string | null {
    return this.coverImageUrl;
  }

  get merchantPhone(): string {
    return this.phone;
  }

  get merchantEmail(): string | null {
    return this.email;
  }

  get merchantAddress(): string {
    return this.address;
  }

  get merchantLatitude(): number | null {
    return this.latitude;
  }

  get merchantLongitude(): number | null {
    return this.longitude;
  }

  get merchantStatus(): MerchantStatus {
    return this.status;
  }

  get merchantRating(): number {
    return this.rating;
  }

  get merchantTotalOrders(): number {
    return this.totalOrders;
  }

  get merchantCapacityConfig(): CapacityConfig {
    return { ...this.capacityConfig };
  }

  get merchantCapacityStatus(): CapacityStatus {
    return this.capacityStatus;
  }

  get merchantCurrentOrderCount(): number {
    return this.currentOrderCount;
  }

  get menuItemList(): ReadonlyArray<MenuItem> {
    return [...this.menuItems];
  }

  get activeMenuItems(): ReadonlyArray<MenuItem> {
    return this.menuItems.filter((mi) => mi.available);
  }

  get operatingHoursList(): ReadonlyArray<OperatingHours> {
    return [...this.operatingHours];
  }

  get documentList(): ReadonlyArray<MerchantDocument> {
    return [...this.documents];
  }

  public isApproved(): boolean {
    return this.status === "APPROVED";
  }

  public isPending(): boolean {
    return this.status === "PENDING";
  }
}
