import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PaymentService } from "../application/payment.service";
import {
  CreatePaymentDto,
  CompletePaymentDto,
  FailPaymentDto,
  RefundPaymentDto,
  PaymentResponseDto,
  PaymentQueryDto,
} from "../application/dtos/payment.dto";

@Controller("api/v1/payments")
@UseGuards(AuthGuard("jwt"))
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ===================== Commands =====================

  @Post()
  async create(@Body() dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    return this.paymentService.create(dto);
  }

  @Patch(":id/complete")
  async complete(
    @Param("id") id: string,
    @Body() dto: CompletePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.complete(id, dto.transactionId);
  }

  @Patch(":id/fail")
  async fail(
    @Param("id") id: string,
    @Body() dto: FailPaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.fail(id, dto.reason);
  }

  @Patch(":id/refund")
  async refund(
    @Param("id") id: string,
    @Body() dto: RefundPaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.refund(id, dto.reason);
  }

  // ===================== Queries =====================

  @Get()
  async findAll(
    @Query() query: PaymentQueryDto,
  ): Promise<PaymentResponseDto[]> {
    if (query.consumerId) {
      return this.paymentService.findByConsumerId(query.consumerId);
    }
    if (query.merchantId) {
      return this.paymentService.findByMerchantId(query.merchantId);
    }
    if (query.orderId) {
      const payment = await this.paymentService.findByOrderId(query.orderId);
      return payment ? [payment] : [];
    }
    return this.paymentService.findAll();
  }

  @Get("order/:orderId")
  async findByOrderId(
    @Param("orderId") orderId: string,
  ): Promise<PaymentResponseDto | null> {
    return this.paymentService.findByOrderId(orderId);
  }

  @Get("consumer/:consumerId")
  async findByConsumerId(
    @Param("consumerId") consumerId: string,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentService.findByConsumerId(consumerId);
  }

  @Get("merchant/:merchantId")
  async findByMerchantId(
    @Param("merchantId") merchantId: string,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentService.findByMerchantId(merchantId);
  }

  @Get(":id")
  async findById(@Param("id") id: string): Promise<PaymentResponseDto> {
    return this.paymentService.findById(id);
  }

  // ===================== Delete =====================

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string): Promise<void> {
    return this.paymentService.delete(id);
  }
}
