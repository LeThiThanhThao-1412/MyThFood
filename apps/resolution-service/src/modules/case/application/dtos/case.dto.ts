import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";
import {
  CaseCategory,
  CaseType,
  FaultParty,
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

  @IsOptional()
  @IsString()
  responseDeadline?: string;

  @IsOptional()
  @IsString()
  reporterId?: string;

  @IsOptional()
  @IsString()
  reporterType?: string;

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

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class RespondCaseDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence?: string[];

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class ActorIdDto {
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class ResolveCaseDto {
  @IsEnum(Verdict)
  verdict!: Verdict;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(FaultParty)
  faultParty?: FaultParty;

  /**
   * Số tiền bồi thường admin chọn cho phần món bị thiếu/sai/hỏng (đồng).
   *
   * Vì sao cần: `MISSING_ITEM`/`WRONG_ITEM`/`DAMAGED_ITEM` trước đây luôn hoàn
   * 100% đơn, nên khách thiếu một món 40.000đ trong đơn 126.038đ vẫn được trả
   * 126.038đ và nhà hàng bị trừ sạch doanh thu. Có số này thì ví chỉ chuyển
   * đúng phần món bị lỗi từ bên có lỗi sang khách (order-service chặn trần bằng
   * tiền món khách thực trả). Bỏ trống ⇒ giữ chính sách hoàn 100%.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compensationAmount?: number;
}
