import { IsNumber, IsOptional, Min } from "class-validator";
import { Type } from "class-transformer";

export class UpdateCapacityDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  maxConcurrentOrders?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  prepTimePerOrder?: number;
}

export class CapacityResponseDto {
  maxConcurrentOrders!: number;
  prepTimePerOrder!: number;
  capacityStatus!: string;
  currentOrderCount!: number;
}

export class CapacityStatusResponseDto {
  status!: string;
  currentOrderCount!: number;
  maxConcurrentOrders!: number;
  prepTimePerOrder!: number;
}
