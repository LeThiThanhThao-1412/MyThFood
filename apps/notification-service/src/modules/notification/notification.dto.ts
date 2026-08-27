import { IsString, IsUUID, IsOptional } from "class-validator";

export class CreateNotificationDto {
  @IsUUID("4")
  userId!: string;

  @IsString()
  type!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  data?: Record<string, unknown>;
}

export class ReadAllNotificationsDto {
  @IsUUID("4")
  userId!: string;
}
