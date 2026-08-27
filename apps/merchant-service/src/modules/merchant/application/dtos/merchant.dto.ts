import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsUUID,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

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
  @IsEnum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"])
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // FIX #5: Filter by category
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
  createdAt!: Date;
  updatedAt!: Date;
}
