import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsUUID } from 'class-validator';

export class CreateConsumerDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsEnum(['MALE', 'FEMALE', 'OTHER'])
  @IsOptional()
  gender?: string;
}