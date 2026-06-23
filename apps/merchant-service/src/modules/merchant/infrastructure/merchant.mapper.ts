import { MerchantId } from "../domain/merchant-id";
import { MenuItemId } from "../domain/menu-item-id";
import {
  Merchant,
  CapacityConfig,
  MerchantStatus,
  CapacityStatus,
} from "../domain/merchant.aggregate";
import { MenuItem, MenuItemCategory } from "../domain/menu-item.entity";
import { OperatingHours } from "../domain/operating-hours.vo";
import {
  MerchantDocument,
  MerchantDocumentId,
} from "../domain/merchant-document.entity";
import { MerchantEntity } from "./merchant.entity";
import { MenuItemEntity } from "./menu-item.entity";
import { OperatingHoursEntity } from "./operating-hours.entity";
import { MerchantDocumentEntity } from "./merchant-document.entity";

/**
 * Maps between Domain (Merchant aggregate) and Persistence (TypeORM entities).
 */
export class MerchantMapper {
  /**
   * Convert TypeORM entities to a domain aggregate.
   */
  public static toDomain(
    entity: MerchantEntity,
    menuItems: MenuItemEntity[],
    operatingHours: OperatingHoursEntity[],
    documents: MerchantDocumentEntity[],
  ): Merchant {
    const id = MerchantId.from(entity.id);

    const domainMenuItems = menuItems.map((mi) =>
      MerchantMapper.menuItemToDomain(mi),
    );
    const domainHours = operatingHours.map((oh) =>
      MerchantMapper.operatingHoursToDomain(oh),
    );
    const domainDocs = documents.map((doc) =>
      MerchantMapper.documentToDomain(doc),
    );

    const capacityConfig: CapacityConfig = entity.capacity_config ?? {
      maxConcurrentOrders: 10,
      prepTimePerOrder: 20,
    };

    return Merchant.rehydrate(id, {
      userId: entity.user_id,
      name: entity.name,
      description: entity.description,
      logoUrl: entity.logo_url,
      coverImageUrl: entity.cover_image_url,
      phone: entity.phone,
      email: entity.email,
      address: entity.address,
      latitude: entity.latitude,
      longitude: entity.longitude,
      status: entity.status as MerchantStatus,
      rating: entity.rating,
      totalOrders: entity.total_orders,
      capacityConfig,
      capacityStatus: entity.capacity_status as CapacityStatus,
      menuItems: domainMenuItems,
      operatingHours: domainHours,
      documents: domainDocs,
      currentOrderCount: entity.current_order_count ?? 0,
    });
  }

  /**
   * Convert a domain aggregate to a TypeORM entity.
   */
  public static toPersistence(merchant: Merchant): MerchantEntity {
    const entity = new MerchantEntity();
    entity.id = merchant.id.toString();
    entity.user_id = merchant.ownerId;
    entity.name = merchant.merchantName;
    entity.description = merchant.merchantDescription;
    entity.logo_url = merchant.merchantLogoUrl;
    entity.cover_image_url = merchant.merchantCoverImageUrl;
    entity.phone = merchant.merchantPhone;
    entity.email = merchant.merchantEmail;
    entity.address = merchant.merchantAddress;
    entity.latitude = merchant.merchantLatitude;
    entity.longitude = merchant.merchantLongitude;
    entity.status = merchant.merchantStatus;
    entity.rating = merchant.merchantRating;
    entity.total_orders = merchant.merchantTotalOrders;
    entity.capacity_config = merchant.merchantCapacityConfig;
    entity.capacity_status = merchant.merchantCapacityStatus;
    entity.current_order_count = merchant.merchantCurrentOrderCount;
    return entity;
  }

  public static menuItemsToPersistence(merchant: Merchant): MenuItemEntity[] {
    return merchant.menuItemList.map((mi) => {
      const entity = new MenuItemEntity();
      entity.id = mi.id.toString();
      entity.merchant_id = merchant.id.toString();
      entity.category = mi.itemCategory;
      entity.name = mi.itemName;
      entity.description = mi.itemDescription;
      entity.price = mi.itemPrice;
      entity.original_price = mi.itemOriginalPrice;
      entity.image_url = mi.itemImageUrl;
      entity.is_available = mi.available;
      entity.is_featured = mi.featured;
      entity.preparation_time = mi.prepTime;
      entity.sort_order = mi.order;
      return entity;
    });
  }

  public static operatingHoursToPersistence(
    merchant: Merchant,
  ): OperatingHoursEntity[] {
    return merchant.operatingHoursList.map((oh) => {
      const entity = new OperatingHoursEntity();
      entity.id = ""; // Will be auto-generated, or we can track existing
      entity.merchant_id = merchant.id.toString();
      entity.day_of_week = oh.dayOfWeek;
      entity.open_time = oh.openTime;
      entity.close_time = oh.closeTime;
      entity.is_closed = oh.isClosed;
      entity.special_date = oh.specialDate;
      return entity;
    });
  }

  public static documentsToPersistence(
    merchant: Merchant,
  ): MerchantDocumentEntity[] {
    return merchant.documentList.map((doc) => {
      const entity = new MerchantDocumentEntity();
      entity.id = doc.id.toString();
      entity.merchant_id = merchant.id.toString();
      entity.type = doc.documentType;
      entity.url = doc.documentUrl;
      entity.status = doc.documentStatus;
      entity.verified_at = doc.verifiedDate;
      return entity;
    });
  }

  // ===================== Private Helpers =====================

  private static menuItemToDomain(entity: MenuItemEntity): MenuItem {
    const id = MenuItemId.from(entity.id);
    return MenuItem.rehydrate(id, {
      merchantId: MerchantId.from(entity.merchant_id),
      category: entity.category as MenuItemCategory,
      name: entity.name,
      description: entity.description,
      price: Number(entity.price),
      originalPrice: entity.original_price
        ? Number(entity.original_price)
        : null,
      imageUrl: entity.image_url,
      isAvailable: entity.is_available,
      isFeatured: entity.is_featured,
      preparationTime: entity.preparation_time,
      sortOrder: entity.sort_order,
    });
  }

  private static operatingHoursToDomain(
    entity: OperatingHoursEntity,
  ): OperatingHours {
    return OperatingHours.create({
      dayOfWeek: entity.day_of_week,
      openTime: entity.open_time ?? "00:00:00",
      closeTime: entity.close_time ?? "00:00:00",
      isClosed: entity.is_closed,
      specialDate: entity.special_date ?? undefined,
    });
  }

  private static documentToDomain(
    entity: MerchantDocumentEntity,
  ): MerchantDocument {
    const id = MerchantDocumentId.from(entity.id);
    return MerchantDocument.rehydrate(id, {
      merchantId: MerchantId.from(entity.merchant_id),
      type: entity.type,
      url: entity.url,
      status: entity.status as "PENDING" | "VERIFIED" | "REJECTED",
      verifiedAt: entity.verified_at,
    });
  }
}
