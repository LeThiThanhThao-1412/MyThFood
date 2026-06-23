import { IsString, IsOptional, IsNotEmpty, IsNumber, IsEnum, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
}

// ===================== Query Merchants =====================

export class MerchantQueryDto {
  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'])
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

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
  totalOrders!: number;
  capacityStatus!: string;
  currentOrderCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
}