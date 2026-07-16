import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { DispatchDeclineReason } from "../../domain/dispatch.aggregate";

export class CreateDispatchDto {
  @IsUUID("4")
  orderId!: string;

  @IsUUID("4")
  merchantId!: string;

  @IsString()
  deliveryAddress!: string;

  @IsNumber()
  deliveryLatitude!: number;

  @IsNumber()
  deliveryLongitude!: number;
}

export class UpdateDispatchNotesDto {
  @IsString()
  notes!: string;
}

export class AssignDriverDto {
  @IsUUID("4")
  driverId!: string;
}

export class DriverAcceptDto {
  @IsUUID("4")
  driverId!: string;
}

export class DriverDeclineDto {
  @IsUUID("4")
  driverId!: string;

  @IsEnum(DispatchDeclineReason)
  reason!: DispatchDeclineReason;

  @IsOptional()
  @IsString()
  detail?: string;
}

export class CancelDispatchDto {
  @IsString()
  reason!: string;
}

export class QueryDispatchDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID("4")
  driverId?: string;

  @IsOptional()
  @IsUUID("4")
  orderId?: string;

  @IsOptional()
  @IsUUID("4")
  merchantId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
