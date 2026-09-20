import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { PenaltyType } from "../../domain/penalty.enums";

export class IssuePenaltyDto {
  @IsString()
  caseId!: string;

  @IsEnum(PenaltyType)
  type!: PenaltyType;

  @IsString()
  targetId!: string;

  @IsString()
  targetType!: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsString()
  reason!: string;
}

export class AppealPenaltyDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence?: string[];
}

export class DecideAppealDto {
  @IsBoolean()
  upheld!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
