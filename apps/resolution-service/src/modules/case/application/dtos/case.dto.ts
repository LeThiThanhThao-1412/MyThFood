import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import {
  CaseCategory,
  CaseType,
  Severity,
  Verdict,
} from "../../domain/case.enums";

export class CreateCaseDto {
  @IsEnum(CaseType)
  type!: CaseType;

  @IsEnum(CaseCategory)
  category!: CaseCategory;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsString()
  respondentId!: string;

  @IsString()
  respondentType!: string;

  @IsString()
  @MinLength(5)
  subject!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence?: string[];
}

export class AddEvidenceDto {
  @IsArray()
  @IsString({ each: true })
  urls!: string[];
}

export class ResolveCaseDto {
  @IsEnum(Verdict)
  verdict!: Verdict;

  @IsOptional()
  @IsString()
  note?: string;
}
