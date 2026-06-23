import { IsString, IsOptional, IsEnum, IsDateString } from "class-validator";

export class UpdateConsumerProfileDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsEnum(["MALE", "FEMALE", "OTHER"])
  @IsOptional()
  gender?: string;
}
