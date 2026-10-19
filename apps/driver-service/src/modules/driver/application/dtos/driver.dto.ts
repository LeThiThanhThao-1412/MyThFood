import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsInt,
  Min,
  Max,
} from "class-validator";

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
