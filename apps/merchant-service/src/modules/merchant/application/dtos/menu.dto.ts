import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  Min,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateMenuItemDto {
  @IsEnum([
    "APPETIZER",
    "MAIN_COURSE",
    "DESSERT",
    "BEVERAGE",
    "SIDE_DISH",
    "COMBO",
    "OTHER",
  ])
  category!: string;

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
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsEnum([
    "APPETIZER",
    "MAIN_COURSE",
    "DESSERT",
    "BEVERAGE",
    "SIDE_DISH",
    "COMBO",
    "OTHER",
  ])
  category?: string;

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
}

export class MenuItemResponseDto {
  id!: string;
  merchantId!: string;
  category!: string;
  name!: string;
  description!: string | null;
  price!: number;
  originalPrice!: number | null;
  imageUrl!: string | null;
  isAvailable!: boolean;
  isFeatured!: boolean;
  preparationTime!: number | null;
  sortOrder!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
