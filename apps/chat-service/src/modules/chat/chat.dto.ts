import {
  IsUUID,
  IsString,
  IsOptional,
  IsIn,
  MaxLength,
} from "class-validator";

export const CHAT_MESSAGE_TYPES = ["TEXT", "IMAGE"] as const;
export const CHAT_SENDER_ROLES = ["CONSUMER", "DRIVER"] as const;

export class GetOrCreateConversationDto {
  @IsUUID("4")
  orderId!: string;

  @IsUUID("4")
  consumerUserId!: string;

  @IsUUID("4")
  driverUserId!: string;
}

export class SendMessageDto {
  @IsIn(CHAT_MESSAGE_TYPES)
  type!: string;

  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class MarkDeliveredDto {
  @IsUUID("4")
  orderId!: string;

  @IsOptional()
  @IsString()
  deliveredAt?: string;
}
