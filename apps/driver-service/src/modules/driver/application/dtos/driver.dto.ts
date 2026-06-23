import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
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

export class UpdateFatigueDto {
  @IsNumber()
  @Min(0)
  minutesSinceLastCheck!: number;
}