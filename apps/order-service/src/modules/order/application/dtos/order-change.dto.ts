import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Option khách/nhà hàng chọn cho món. Không nhận `priceDelta`/`name` từ client
 * — server luôn resolve từ menu hiện tại để tránh thao túng giá.
 */
export class ChangeItemOptionDto {
  @IsString()
  @IsNotEmpty()
  optionId!: string;

  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity?: number;
}

export class ChangeItemDto {
  /**
   * Vị trí của món trong `order.items` hiện tại. Bỏ trống = món mới thêm.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sourceIndex?: number;

  @IsUUID("4")
  menuItemId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChangeItemOptionDto)
  options?: ChangeItemOptionDto[];

  @IsOptional()
  @IsString()
  specialInstructions?: string;
}

export class CreateOrderChangeRequestDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChangeItemDto)
  items!: ChangeItemDto[];
}

export class RejectOrderChangeRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelOrderChangeRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AcceptOrderChangeRequestDto {
  /** Payment bổ sung (bắt buộc với CREDIT_CARD khi delta > 0, ở bước xác nhận). */
  @IsOptional()
  @IsUUID("4")
  paymentId?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;
}

/** Snapshot món trong yêu cầu chỉnh sửa / nhật ký điều chỉnh. */
export interface ChangeItemSnapshot {
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  originalPrice: number | null;
  flashSaleFundedBy: string | null;
  subtotal: number;
  specialInstructions: string | null;
  options: Array<{
    optionId: string;
    groupId: string;
    groupName?: string;
    name: string;
    priceDelta: number;
    quantity?: number;
  }> | null;
}

export interface ChangeTotalsSnapshot {
  subtotal: number;
  discount: number;
  total: number;
}

export class OrderChangeRequestResponseDto {
  id!: string;
  orderId!: string;
  merchantId!: string;
  consumerId!: string;
  status!: string;
  reason!: string | null;
  rejectReason!: string | null;
  beforeItems!: ChangeItemSnapshot[];
  afterItems!: ChangeItemSnapshot[];
  before!: ChangeTotalsSnapshot;
  after!: ChangeTotalsSnapshot;
  deltaAmount!: number;
  paymentMethod!: string;
  moneyStatus!: string;
  adjustmentPaymentId!: string | null;
  beforeItemsVersion!: number;
  expiresAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  confirmedAt!: string | null;
}

export class OrderAdjustmentResponseDto {
  id!: string;
  orderId!: string;
  changeRequestId!: string;
  before!: ChangeTotalsSnapshot;
  after!: ChangeTotalsSnapshot;
  deltaAmount!: number;
  paymentMethod!: string;
  moneyStatus!: string;
  settlementStatus!: string;
  createdAt!: string;
}
