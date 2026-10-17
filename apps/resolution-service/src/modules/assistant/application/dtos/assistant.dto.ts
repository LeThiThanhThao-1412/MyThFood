import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class AnalyzeCaseDto {
  /** Bỏ qua ảnh bằng chứng để tiết kiệm token/thời gian. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  skipImages?: boolean;

  /** Ghi đè số ảnh bằng chứng tối đa đưa vào prompt (0..8). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  @Type(() => Number)
  maxImages?: number;
}

/** Admin duyệt / bỏ qua gợi ý AI của một vụ việc. */
export class ReviewAnalysisDto {
  @IsIn(["ACCEPTED", "REJECTED"])
  decision!: "ACCEPTED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
