import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsIn,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";
import { DispatchDeclineReason } from "../../domain/dispatch.aggregate";

export class CreateDispatchDto {
  @IsUUID("4")
  orderId!: string;

  @IsUUID("4")
  merchantId!: string;

  @IsString()
  deliveryAddress!: string;

  @IsNumber()
  @Type(() => Number)
  deliveryLatitude!: number;

  @IsNumber()
  @Type(() => Number)
  deliveryLongitude!: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  merchantLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  merchantLongitude?: number;

  /** Phương thức giao hàng: SAVER | FAST | PRIORITY (mặc định FAST). */
  @IsOptional()
  @IsIn(["SAVER", "FAST", "PRIORITY"])
  deliveryOption?: string;

  /**
   * Thứ tự ưu tiên điều phối (SAVER 0, FAST 1, PRIORITY 2) do order-service
   * gửi kèm. Dispatch tự suy ra từ `deliveryOption` nên chỉ nhận để tương
   * thích payload — thiếu field này khiến request tạo dispatch bị 400
   * (`forbidNonWhitelisted`) và đơn không có dispatch đúng phương thức.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  priorityRank?: number;

  /** Thời điểm cam kết giao hàng do order-service tính. */
  @IsOptional()
  @IsDateString()
  promisedDeliveryAt?: string;

  /** Số đơn tối đa được gộp (SAVER = 3). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxStackedOrders?: number;

  /** Timeout chờ tài xế nhận đơn (giây). */
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  dispatchTimeoutSeconds?: number;

  /** Timeout chờ tài xế phản hồi khi đã được gán (giây). */
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(600)
  driverResponseTimeoutSeconds?: number;
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
  /**
   * Giữ lại để tương thích payload cũ; server luôn lấy tài xế từ dispatch
   * (không tin driverId do client gửi lên).
   */
  @IsOptional()
  @IsUUID("4")
  driverId?: string;

  /**
   * GPS hiện tại của app tài xế ngay lúc bấm “Nhận đơn”. Nếu có, dispatch-service
   * cập nhật vị trí tài xế sang driver-service TRƯỚC khi kiểm tra bán kính nhận
   * đơn — tránh dùng toạ độ cũ (nhịp GPS 5 giây có thể bị trễ/mất mạng).
   */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude?: number;
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

export class RecordDriverDeclineDto {
  @IsUUID("4")
  driverId!: string;
}

export class DriverCancelDto {
  @IsString()
  reason!: string;
}

export class DeliveryFailedDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsIn(["DRIVER", "CUSTOMER"])
  faultParty?: string;
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
