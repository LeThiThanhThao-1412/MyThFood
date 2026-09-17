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
