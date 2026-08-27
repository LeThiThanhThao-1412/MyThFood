import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  Min,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsIn,
  IsInt,
} from "class-validator";
import { Type } from "class-transformer";

export class MenuItemOptionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Type(() => Number)
  priceDelta!: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  minQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxQuantity?: number;
}

export class MenuItemOptionGroupDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(["CHOICE", "MULTI_CHOICE", "TOGGLE", "QUANTITY"])
  type!: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  minSelections?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxSelections?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemOptionDto)
  options!: MenuItemOptionDto[];
}

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price!: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFeatured?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  preparationTime?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemOptionGroupDto)
  optionGroups?: MenuItemOptionGroupDto[];
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFeatured?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  preparationTime?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemOptionGroupDto)
  optionGroups?: MenuItemOptionGroupDto[];
}

export class MenuItemResponseDto {
  id!: string;
  merchantId!: string;
  category!: string;
  categoryId!: string | null;
  name!: string;
  description!: string | null;
  price!: number;
  originalPrice!: number | null;
  imageUrl!: string | null;
  isAvailable!: boolean;
  isFeatured!: boolean;
  preparationTime!: number | null;
  sortOrder!: number;
  optionGroups!: MenuItemOptionGroupDto[];
  createdAt!: Date;
  updatedAt!: Date;
}
