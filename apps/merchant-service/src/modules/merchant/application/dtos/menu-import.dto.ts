import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { MenuItemOptionGroupDto } from "./menu.dto";
import { CreateMenuCategoryDto } from "./menu-category.dto";

/**
 * Một món trong file/batch import. Gần giống CreateMenuItemDto nhưng nới lỏng
 * `category` (cho phép bỏ trống, service sẽ mặc định "Khác").
 */
export class ImportMenuItemDto {
  @IsOptional()
  @IsString()
  category?: string;

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

export class BulkImportMenuDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMenuCategoryDto)
  categories?: CreateMenuCategoryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportMenuItemDto)
  items!: ImportMenuItemDto[];
}

export interface MenuImportError {
  /** Chỉ số của món trong mảng `items` (0-based). */
  index: number;
  name?: string;
  message: string;
}

export interface MenuImportResult {
  createdCategories: number;
  createdItems: number;
  errors: MenuImportError[];
}
