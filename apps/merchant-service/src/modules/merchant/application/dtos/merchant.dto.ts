import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsUUID,
  IsArray,
  IsBoolean,
  Min,
  Max,
} from "class-validator";
import { Type, Transform } from "class-transformer";

// ===================== Discovery Enums =====================

/**
 * Sort keys handled by the database (distance / ship fee are client-side).
 * Declared as an object (not an array) so class-validator can list the allowed
 * values in the 400 error message.
 */
export const MERCHANT_SORT_KEYS = {
  rating: "rating",
  popular: "popular",
  newest: "newest",
  name: "name",
} as const;

export type MerchantSortKey = keyof typeof MERCHANT_SORT_KEYS;

export const SORT_ORDERS = { ASC: "ASC", DESC: "DESC" } as const;

export const MERCHANT_STATUSES = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;

// ===================== Register Merchant =====================

export class RegisterMerchantDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  // FIX #5: Category system - 1 primary + up to 3 secondary categories
  @IsOptional()
  @IsString()
  primaryCategory?: string;

  @IsOptional()
  @IsString({ each: true })
  secondaryCategories?: string[];
}

// ===================== Update Merchant =====================

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  // FIX #5: Category system - 1 primary + up to 3 secondary categories
  @IsOptional()
  @IsString()
  primaryCategory?: string;

  @IsOptional()
  @IsString({ each: true })
  secondaryCategories?: string[];
}

// ===================== Query Merchants =====================

export class MerchantQueryDto {
  @IsOptional()
  @IsEnum(MERCHANT_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // FIX #5: Filter by category
  @IsOptional()
  @IsString()
  category?: string;

  /**
   * Multi-category filter. Accepts CSV (`?categories=pho,rice`) or a repeated
   * query param. Kept separate from `category` for backward compatibility.
   */
  @IsOptional()
  @Transform(({ value }) => {
    const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
    const cleaned = raw
      .map((v) => String(v).trim().toLowerCase())
      .filter((v) => v.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  })
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  /** Only return merchants whose rating is greater than or equal to this. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  minRating?: number;

  /**
   * Only return merchants that are open right now — mirrors
   * `Merchant.isOpen()`: manual flag + APPROVED + today's operating hours.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  openNow?: boolean;

  @IsOptional()
  @IsEnum(MERCHANT_SORT_KEYS)
  sortBy?: MerchantSortKey;

  @IsOptional()
  @IsEnum(SORT_ORDERS)
  sortOrder?: "ASC" | "DESC";

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  take?: number;
}

// ===================== Search Menu Items (dish search) =====================

export class MenuSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  q!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  take?: number;
}

// ===================== Admin Approval =====================

export class ApproveMerchantDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectMerchantDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

// ===================== Update Rating (internal) =====================

export class UpdateRatingDto {
  @IsNumber()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  rating!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalRatings!: number;
}

// ===================== Merchant Response =====================

/** Menu items that matched the `search` keyword (populated only when searching). */
export class MatchedMenuItemDto {
  id!: string;
  name!: string;
  price!: number;
  imageUrl!: string | null;
}

export class MerchantResponseDto {
  id!: string;
  userId!: string;
  name!: string;
  description!: string | null;
  logoUrl!: string | null;
  coverImageUrl!: string | null;
  phone!: string;
  email!: string | null;
  address!: string;
  latitude!: number | null;
  longitude!: number | null;
  status!: string;
  rating!: number;
  totalRatings!: number;
  totalOrders!: number;
  capacityStatus!: string;
  currentOrderCount!: number;
  primaryCategory!: string | null;
  secondaryCategories!: string[];
  isOpen!: boolean;
  isOpenNow!: boolean;
  matchedMenuItems?: MatchedMenuItemDto[];
  createdAt!: Date;
  updatedAt!: Date;
}

// ===================== Menu Search Response =====================

export class MenuSearchMerchantDto {
  id!: string;
  name!: string;
  rating!: number;
  address!: string;
  latitude!: number | null;
  longitude!: number | null;
  isOpen!: boolean;
  isOpenNow!: boolean;
}

export class MenuSearchItemDto {
  id!: string;
  merchantId!: string;
  name!: string;
  description!: string | null;
  price!: number;
  imageUrl!: string | null;
  category!: string;
  isAvailable!: boolean;
  merchant!: MenuSearchMerchantDto;
}
