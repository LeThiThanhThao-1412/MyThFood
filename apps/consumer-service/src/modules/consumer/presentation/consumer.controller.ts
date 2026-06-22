import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConsumerService } from '../application/consumer.service';
import { Consumer } from '../domain/consumer.aggregate';
import { Address } from '../domain/address.vo';
import { PaymentMethod } from '../domain/payment-method.vo';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateConsumerDto } from '../application/dtos/create-consumer.dto';
import { UpdateConsumerProfileDto } from '../application/dtos/update-consumer-profile.dto';
import { CreateAddressDto } from '../application/dtos/address.dto';
import { CreatePaymentMethodDto } from '../application/dtos/payment-method.dto';

@Controller('consumers')
@UseGuards(JwtAuthGuard)
export class ConsumerController {
  constructor(private readonly consumerService: ConsumerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateConsumerDto) {
    const result = await this.consumerService.createConsumer({
      userId: dto.userId,
      fullName: dto.fullName,
      avatar: dto.avatar,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender as 'MALE' | 'FEMALE' | 'OTHER' | undefined,
    });

    if (result.isFailure) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: result.error.message };
    }

    return { statusCode: HttpStatus.CREATED, data: this.toResponse(result.value) };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const consumer = await this.consumerService.getById(id);
    if (!consumer) {
      return { statusCode: HttpStatus.NOT_FOUND, message: 'Consumer not found' };
    }
    return { statusCode: HttpStatus.OK, data: this.toResponse(consumer) };
  }

  @Get('user/:userId')
  async getByUserId(@Param('userId') userId: string) {
    const consumer = await this.consumerService.getByUserId(userId);
    if (!consumer) {
      return { statusCode: HttpStatus.NOT_FOUND, message: 'Consumer not found' };
    }
    return { statusCode: HttpStatus.OK, data: this.toResponse(consumer) };
  }

  @Put(':id')
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateConsumerProfileDto) {
    const result = await this.consumerService.updateProfile(id, {
      fullName: dto.fullName,
      avatar: dto.avatar,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender as 'MALE' | 'FEMALE' | 'OTHER' | undefined,
    });

    if (result.isFailure) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: result.error.message };
    }

    return { statusCode: HttpStatus.OK, data: this.toResponse(result.value) };
  }

  @Post(':id/addresses')
  @HttpCode(HttpStatus.CREATED)
  async addAddress(@Param('id') id: string, @Body() dto: CreateAddressDto) {
    const result = await this.consumerService.addAddress(id, {
      label: dto.label,
      fullAddress: dto.fullAddress,
      city: dto.city,
      district: dto.district ?? '',
      ward: dto.ward ?? '',
      street: dto.street ?? '',
      gps: dto.gps ? { latitude: dto.gps.latitude, longitude: dto.gps.longitude } : undefined,
      type: dto.type,
    });

    if (result.isFailure) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: result.error.message };
    }

    return { statusCode: HttpStatus.CREATED, data: this.toResponse(result.value) };
  }

  @Delete(':id/addresses/:addressId')
  async removeAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
    const result = await this.consumerService.removeAddress(id, addressId);
    if (result.isFailure) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: result.error.message };
    }
    return { statusCode: HttpStatus.OK, data: this.toResponse(result.value) };
  }

  @Patch(':id/addresses/:addressId/default')
  async setDefaultAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
    const result = await this.consumerService.setDefaultAddress(id, addressId);
    if (result.isFailure) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: result.error.message };
    }
    return { statusCode: HttpStatus.OK, data: this.toResponse(result.value) };
  }

  @Post(':id/payment-methods')
  @HttpCode(HttpStatus.CREATED)
  async addPaymentMethod(@Param('id') id: string, @Body() dto: CreatePaymentMethodDto) {
    const result = await this.consumerService.addPaymentMethod(id, {
      type: dto.type as 'CREDIT_CARD' | 'DEBIT_CARD' | 'E_WALLET',
      provider: dto.provider,
      token: dto.token,
      lastFourDigits: dto.lastFourDigits,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
    });

    if (result.isFailure) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: result.error.message };
    }

    return { statusCode: HttpStatus.CREATED, data: this.toResponse(result.value) };
  }

  @Delete(':id/payment-methods/:pmId')
  async removePaymentMethod(@Param('id') id: string, @Param('pmId') pmId: string) {
    const result = await this.consumerService.removePaymentMethod(id, pmId);
    if (result.isFailure) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: result.error.message };
    }
    return { statusCode: HttpStatus.OK, data: this.toResponse(result.value) };
  }

  @Patch(':id/payment-methods/:pmId/default')
  async setDefaultPaymentMethod(@Param('id') id: string, @Param('pmId') pmId: string) {
    const result = await this.consumerService.setDefaultPaymentMethod(id, pmId);
    if (result.isFailure) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: result.error.message };
    }
    return { statusCode: HttpStatus.OK, data: this.toResponse(result.value) };
  }

  private toResponse(consumer: Consumer) {
    return {
      id: consumer.id.toString(),
      userId: consumer.userIdValue,
      fullName: consumer.displayName,
      avatar: consumer.avatarUrl,
      dateOfBirth: consumer.birthDate?.toISOString() ?? null,
      gender: consumer.consumerGender,
      addresses: consumer.addressList.map((a: Address) => ({
        id: a.id.toString(),
        label: a.label,
        fullAddress: a.fullAddress,
        city: a.city,
        district: a.district,
        ward: a.ward,
        street: a.street,
        gps: a.gps ? { latitude: a.gps.latitude, longitude: a.gps.longitude } : null,
        type: a.type,
        isDefault: a.isDefault,
      })),
      paymentMethods: consumer.paymentMethodList.map((p: PaymentMethod) => ({
        id: p.id.toString(),
        type: p.type,
        provider: p.provider,
        lastFourDigits: p.lastFourDigits,
        expiryDate: p.expiryDate?.toISOString() ?? null,
        isDefault: p.isDefault,
      })),
    };
  }
}