import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  IsEnum,
  IsUUID,
  Min,
  IsDateString,
  ArrayMinSize,
} from "class-validator";
import { Type } from "class-transformer";

export class OrderItemDto {
  @IsUUID("4")
  @IsNotEmpty()
  menuItemId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice!: number;

  @IsString()
  @IsOptional()
  specialInstructions?: string;
}

export class PlaceOrderDto {
  @IsUUID("4")
  @IsNotEmpty()
  consumerId!: string;

  @IsUUID("4")
  @IsNotEmpty()
  merchantId!: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(["DELIVERY", "PICKUP"])
  orderType!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  deliveryLatitude?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  deliveryLongitude?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  deliveryFee?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  serviceFee?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  discount?: number;

  @IsDateString()
  @IsOptional()
  estimatedDeliveryTime?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateOrderDto {
  @IsDateString()
  @IsOptional()
  estimatedDeliveryTime?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID("4")
  @IsOptional()
  driverId?: string;
}

export class StatusTransitionDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsUUID("4")
  @IsOptional()
  driverId?: string;
}

export class OrderQueryDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsUUID("4")
  @IsOptional()
  merchantId?: string;

  @IsUUID("4")
  @IsOptional()
  consumerId?: string;

  @IsOptional()
  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  take?: number;
}

export class OrderResponseDto {
  id!: string;
  consumerId!: string;
  merchantId!: string;
  orderType!: string;
  status!: string;
  items!: OrderItemResponseDto[];
  subtotal!: number;
  deliveryFee!: number;
  serviceFee!: number;
  discount!: number;
  totalAmount!: number;
  deliveryAddress!: string | null;
  deliveryLatitude!: number | null;
  deliveryLongitude!: number | null;
  estimatedDeliveryTime!: string | null;
  notes!: string | null;
  driverId!: string | null;
  cancelReason!: string | null;
  rejectionReason!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class OrderItemResponseDto {
  menuItemId!: string;
  name!: string;
  quantity!: number;
  unitPrice!: number;
  subtotal!: number;
  specialInstructions!: string | null;
}
