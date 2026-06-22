import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsEnum(['CREDIT_CARD', 'DEBIT_CARD', 'E_WALLET'])
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  provider!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  lastFourDigits!: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;
}