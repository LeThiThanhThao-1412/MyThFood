import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

export class UpdateDeliveryOptionConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(5)
  @Type(() => Number)
  feeFactor?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200000)
  @Type(() => Number)
  fixedSurcharge?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200000)
  @Type(() => Number)
  minFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500000)
  @Type(() => Number)
  maxFee?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  @Type(() => Number)
  prepMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  @Type(() => Number)
  etaBufferMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  @Type(() => Number)
  dispatchTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(600)
  @Type(() => Number)
  driverResponseTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  maxStackedOrders?: number;
}
