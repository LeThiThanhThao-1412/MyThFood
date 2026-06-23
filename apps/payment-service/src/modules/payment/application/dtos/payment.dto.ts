import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsString,
  IsEnum,
} from "class-validator";
import { Type } from "class-transformer";
import { PaymentMethod } from "../../domain/payment.aggregate";

export class CreatePaymentDto {
  @IsUUID("4")
  @IsNotEmpty()
  orderId!: string;

  @IsUUID("4")
  @IsNotEmpty()
  consumerId!: string;

  @IsUUID("4")
  @IsNotEmpty()
  merchantId!: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amount!: number;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;
}

export class CompletePaymentDto {
  @IsString()
  @IsNotEmpty()
  transactionId!: string;
}

export class FailPaymentDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class RefundPaymentDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class PaymentResponseDto {
  id!: string;
  orderId!: string;
  consumerId!: string;
  merchantId!: string;
  amount!: number;
  paymentMethod!: string;
  status!: string;
  transactionId!: string | null;
  failureReason!: string | null;
  refundReason!: string | null;
  refundedAmount!: number | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class PaymentQueryDto {
  @IsUUID("4")
  @IsOptional()
  consumerId?: string;

  @IsUUID("4")
  @IsOptional()
  merchantId?: string;

  @IsUUID("4")
  @IsOptional()
  orderId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
