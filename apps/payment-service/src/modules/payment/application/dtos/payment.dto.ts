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
import { PaymentMethod, PaymentStatus } from "../../domain/payment.aggregate";
import { OwnerType } from "../../../wallet/domain/wallet.aggregate";

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

export class CreateStripePaymentDto extends CreatePaymentDto {
  @IsOptional()
  @IsString()
  currency?: string;
}

export class AssignDriverDto {
  @IsUUID("4")
  @IsNotEmpty()
  driverId!: string;
}

export class SplitAndCompletePaymentDto {
  @IsString()
  @IsNotEmpty()
  merchantStripeAccountId!: string;

  @IsString()
  @IsNotEmpty()
  driverStripeAccountId!: string;
}

export class RefundPaymentDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  refundAmount?: number;
}

export class WalletWithdrawalDto {
  @IsUUID("4")
  @IsNotEmpty()
  ownerId!: string;

  @IsEnum(OwnerType)
  @IsNotEmpty()
  ownerType!: OwnerType;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  stripeAccountId!: string;
}

export class CreateConnectedAccountDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  type?: string;
}

export class PaymentResponseDto {
  id!: string;
  orderId!: string;
  consumerId!: string;
  merchantId!: string;
  driverId!: string | null;
  amount!: number;
  paymentMethod!: string;
  status!: string;
  stripePaymentIntentId!: string | null;
  stripeTransferMerchantId!: string | null;
  stripeTransferDriverId!: string | null;
  transactionId!: string | null;
  failureReason!: string | null;
  refundReason!: string | null;
  refundedAmount!: number | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class WalletResponseDto {
  id!: string;
  ownerId!: string;
  ownerType!: string;
  balance!: number;
  currency!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class WalletTransactionResponseDto {
  id!: string;
  walletId!: string;
  ownerId!: string;
  ownerType!: string;
  type!: string;
  amount!: number;
  balanceBefore!: number;
  balanceAfter!: number;
  description!: string | null;
  orderId!: string | null;
  stripeTransferId!: string | null;
  stripePayoutId!: string | null;
  createdAt!: Date;
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
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}
