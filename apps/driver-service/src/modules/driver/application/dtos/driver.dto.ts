import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsInt,
  IsArray,
  IsISO8601,
  ArrayMaxSize,
  ArrayMinSize,
  Min,
  Max,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateDriverDto {
  @IsString()
  userId!: string;

  @IsString()
  fullName!: string;

  @IsString()
  phoneNumber!: string;

  @IsEmail()
  email!: string;

  @IsString()
  idCardNumber!: string;

  @IsString()
  driverLicenseNumber!: string;

  @IsString()
  vehicleRegistrationNumber!: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsString()
  insuranceNumber!: string;

  @IsOptional()
  @IsString()
  criminalRecordUrl?: string;
}

export class UpdateDriverProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}

export class UpdateLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

/**
 * Một điểm GPS trong lô gửi bù (`POST /drivers/:id/location/batch`).
 *
 * `recordedAt` là thời điểm **thiết bị** ghi nhận — giữ nguyên khi client gửi
 * bù sau khi mất mạng, nhờ đó lịch sử GPS không bị dồn về thời điểm flush.
 */
export class LocationPointDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsISO8601()
  recordedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;
}

export class UpdateLocationBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LocationPointDto)
  points!: LocationPointDto[];
}

export class AssignOrderDto {
  @IsString()
  orderId!: string;

  /** Số đơn tối đa được giữ (SAVER = 3, FAST/PRIORITY = 1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConcurrentOrders?: number;
}

export class ReleaseOrderDto {
  @IsOptional()
  @IsString()
  orderId?: string;
}

export class CompleteOrderDto {
  @IsOptional()
  @IsString()
  orderId?: string;
}

export class UpdateFatigueDto {
  @IsNumber()
  @Min(0)
  minutesSinceLastCheck!: number;
}

export class RateDriverDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}

export class PenalizeCancellationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  blockMinutes?: number;
}

export class DriverComplianceDto {
  @IsString()
  action!: string; // SUSPEND | BAN | DEDUCT_REPUTATION

  @IsOptional()
  @IsInt()
  @Min(0)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number;

  /** Lý do xử phạt (hiển thị cho tài xế khi đăng nhập). */
  @IsOptional()
  @IsString()
  reason?: string;
}
