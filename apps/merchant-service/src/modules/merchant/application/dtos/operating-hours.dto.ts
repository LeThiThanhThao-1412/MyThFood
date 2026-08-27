import {
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

export class OperatingHoursDto {
  @IsNumber()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  dayOfWeek!: number;

  @IsString()
  openTime!: string;

  @IsString()
  closeTime!: string;

  @IsBoolean()
  @Type(() => Boolean)
  isClosed!: boolean;

  @IsOptional()
  @IsString()
  specialDate?: string;
}

export class SetOperatingHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperatingHoursDto)
  hours!: OperatingHoursDto[];
}

export class OperatingHoursResponseDto {
  dayOfWeek!: number;
  openTime!: string;
  closeTime!: string;
  isClosed!: boolean;
  specialDate!: string | null;
}
