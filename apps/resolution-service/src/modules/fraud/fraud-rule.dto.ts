import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

export class CreateFraudRuleDto {
  @IsString()
  name!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateFraudRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
