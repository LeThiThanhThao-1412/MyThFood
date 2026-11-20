import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from "class-validator";
import { Transform } from "class-transformer";

export enum UserRoleFilter {
  CONSUMER = "CONSUMER",
  MERCHANT_OWNER = "MERCHANT_OWNER",
  DRIVER = "DRIVER",
  ADMIN = "ADMIN",
}

export enum UserStatusFilter {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
  BANNED = "BANNED",
  REJECTED = "REJECTED",
}

/** Trạng thái admin được phép đặt trực tiếp qua endpoint cập nhật status. */
export enum UserStatusUpdate {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
}

export class QueryUsersDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;

  @IsOptional()
  @IsEnum(UserRoleFilter)
  role?: UserRoleFilter;

  @IsOptional()
  @IsEnum(UserStatusFilter)
  status?: UserStatusFilter;

  @IsOptional()
  @IsString()
  search?: string;
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatusUpdate)
  status!: UserStatusUpdate;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  @Max(3650)
  durationDays?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectUserDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UserAdminResponseDto {
  id!: string;
  phone!: string;
  fullName!: string;
  email!: string | null;
  roles!: string[];
  status!: string;
  suspendedUntil!: Date | null;
  suspendedAt!: Date | null;
  suspendReason!: string | null;
  rejectedAt!: Date | null;
  rejectReason!: string | null;
  /** Ngày tài khoản bị từ chối sẽ bị xóa (rejectedAt + 3 ngày). */
  rejectionDeleteAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class PaginatedUsersResponseDto {
  items!: UserAdminResponseDto[];
  total!: number;
}
