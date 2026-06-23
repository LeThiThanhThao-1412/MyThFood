import { IsUUID, IsNotEmpty, IsNumber, Min, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInventoryDto {
  @IsUUID('4')
  @IsNotEmpty()
  menuItemId!: string;

  @IsUUID('4')
  @IsNotEmpty()
  merchantId!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalQuantity!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number;
}

export class ReserveDto {
  @IsUUID('4')
  @IsNotEmpty()
  orderId!: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  timeoutMinutes?: number;
}

export class ReleaseDto {
  @IsUUID('4')
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ConsumeDto {
  @IsUUID('4')
  @IsNotEmpty()
  orderId!: string;
}

export class UpdateTotalDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalQuantity!: number;
}

export class InventoryResponseDto {
  id!: string;
  menuItemId!: string;
  merchantId!: string;
  totalQuantity!: number;
  availableQuantity!: number;
  reservedQuantity!: number;
  lowStockThreshold!: number;
  reservations!: ReservationResponseDto[];
  isLowStock!: boolean;
  isOutOfStock!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class ReservationResponseDto {
  orderId!: string;
  quantity!: number;
  reservedAt!: Date;
  expiresAt!: Date;
}