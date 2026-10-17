import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsOptional,
  IsIn,
  IsInt,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  IsBoolean,
  ArrayMinSize,
} from "class-validator";
import { Type } from "class-transformer";

export class PromotionItemDto {
  @IsUUID("4")
  menuItemId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice!: number;
}

export class CreatePromotionDto {
  @IsUUID("4")
  merchantId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsIn(["PERCENT", "FIXED"])
  type!: string;

  @IsIn(["FOOD", "SHIPPING", "ITEM"])
  target!: string;

  @IsOptional()
  @IsUUID("4")
  menuItemId?: string;

  @IsOptional()
  @IsString()
  menuItemName?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minOrderValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxDiscount?: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  usageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  usageLimitPerUser?: number;
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsUUID("4")
  menuItemId?: string;

  @IsOptional()
  @IsString()
  menuItemName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minOrderValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxDiscount?: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  usageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  usageLimitPerUser?: number;
}

export class ValidatePromotionDto {
  @IsUUID("4")
  merchantId!: string;

  @IsString()
  code!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  foodTotal!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  shippingFee?: number;

  @IsOptional()
  @IsUUID("4")
  consumerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  itemTotal?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionItemDto)
  items?: PromotionItemDto[];
}

export class UpdateCompensationConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class IssueCompensationVoucherDto {
  @IsUUID("4")
  consumerId!: string;

  @IsUUID("4")
  sourceOrderId!: string;
}

export class ApplyCompensationVoucherDto {
  @IsUUID("4")
  voucherId!: string;

  @IsUUID("4")
  consumerId!: string;

  @IsUUID("4")
  orderId!: string;
}

export class ApplyPromotionDto {
  @IsUUID("4")
  merchantId!: string;

  @IsString()
  code!: string;

  @IsUUID("4")
  orderId!: string;

  @IsUUID("4")
  consumerId!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  foodTotal!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  shippingFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  itemTotal?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionItemDto)
  items?: PromotionItemDto[];
}

// ============================================================================
// Flash Sale DTOs
// ============================================================================

export class FlashSaleItemInputDto {
  @IsUUID("4")
  menuItemId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice?: number;
}

export class CreateFlashSaleItemDto {
  @IsUUID("4")
  menuItemId!: string;

  @IsOptional()
  @IsString()
  menuItemName?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  originalPrice!: number;

  @IsIn(["PERCENT", "FIXED_PRICE"])
  discountType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salePrice?: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  totalQuantity!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limitPerUser?: number;
}

export class CreateFlashSaleDto {
  @IsUUID("4")
  merchantId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFlashSaleItemDto)
  items!: CreateFlashSaleItemDto[];

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsIn(["MERCHANT", "PLATFORM"])
  fundedBy?: string;
}

export class UpdateFlashSaleItemDto {
  @IsUUID("4")
  id!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  totalQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limitPerUser?: number;
}

export class UpdateFlashSaleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFlashSaleItemDto)
  items?: UpdateFlashSaleItemDto[];
}

export class ValidateFlashSaleDto {
  @IsUUID("4")
  merchantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FlashSaleItemInputDto)
  items!: FlashSaleItemInputDto[];

  @IsOptional()
  @IsUUID("4")
  consumerId?: string;
}

export class ApplyFlashSaleDto {
  @IsUUID("4")
  merchantId!: string;

  @IsUUID("4")
  consumerId!: string;

  @IsUUID("4")
  orderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FlashSaleItemInputDto)
  items!: FlashSaleItemInputDto[];
}

export class RefundFlashSaleDto {
  @IsUUID("4")
  orderId!: string;
}

// ===================== Order adjustment (đổi món) =====================

export class RecalculateUsageItemDto {
  @IsUUID("4")
  menuItemId!: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  quantity!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice!: number;
}

/**
 * Tính lại discount của promotion usage sau khi nhà hàng đổi món.
 * `dryRun=true` chỉ xem trước, không ghi DB (dùng khi tạo yêu cầu chỉnh sửa).
 */
export class RecalculateUsageDto {
  @IsUUID("4")
  orderId!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  foodTotal!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  shippingFee?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecalculateUsageItemDto)
  items?: RecalculateUsageItemDto[];
}

export class RefundFlashSaleItemDto {
  @IsUUID("4")
  menuItemId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}

/** Hoàn suất flash sale cho phần số lượng món bị giảm/xóa. */
export class RefundFlashSaleItemsDto {
  @IsUUID("4")
  orderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundFlashSaleItemDto)
  items!: RefundFlashSaleItemDto[];
}
