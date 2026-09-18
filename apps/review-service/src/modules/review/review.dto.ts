import {
  IsString,
  IsUUID,
  IsInt,
  IsOptional,
  IsArray,
  Min,
  Max,
} from "class-validator";

export class CreateReviewDto {
  @IsUUID("4")
  orderId!: string;

  @IsUUID("4")
  consumerId!: string;

  @IsUUID("4")
  merchantId!: string;

  @IsOptional()
  @IsUUID("4")
  driverId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  driverRating?: number;

  @IsOptional()
  @IsString()
  driverComment?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class ReplyReviewDto {
  @IsString()
  reply!: string;
}
