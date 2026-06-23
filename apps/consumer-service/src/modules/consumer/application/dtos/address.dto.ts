import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from "class-validator";

export class GpsCoordinatesDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  fullAddress!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  ward?: string;

  @IsString()
  @IsOptional()
  street?: string;

  @IsOptional()
  gps?: GpsCoordinatesDto;

  @IsEnum(["HOME", "WORK", "OTHER"])
  @IsOptional()
  type?: string;
}

export class UpdateAddressLabelDto {
  @IsString()
  @IsNotEmpty()
  label!: string;
}
