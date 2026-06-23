import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InventoryService } from '../application/inventory.service';
import {
  CreateInventoryDto,
  ReserveDto,
  ReleaseDto,
  ConsumeDto,
  UpdateTotalDto,
  InventoryResponseDto,
  ReservationResponseDto,
} from '../application/dtos/inventory.dto';
import { Inventory } from '../domain/inventory.aggregate';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'))
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  async create(@Body() dto: CreateInventoryDto): Promise<InventoryResponseDto> {
    const inv = await this.inventoryService.create(dto);
    return this.toResponse(inv);
  }

  @Get()
  async findAll(): Promise<InventoryResponseDto[]> {
    const items = await this.inventoryService.findAll();
    return items.map((i) => this.toResponse(i));
  }

  @Get('merchant/:merchantId')
  async findByMerchant(@Param('merchantId') merchantId: string): Promise<InventoryResponseDto[]> {
    const items = await this.inventoryService.findByMerchantId(merchantId);
    return items.map((i) => this.toResponse(i));
  }

  @Get('menuitem/:menuItemId')
  async findByMenuItem(@Param('menuItemId') menuItemId: string): Promise<InventoryResponseDto> {
    const inv = await this.inventoryService.findByMenuItemId(menuItemId);
    return this.toResponse(inv);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<InventoryResponseDto> {
    const inv = await this.inventoryService.findById(id);
    return this.toResponse(inv);
  }

  @Put(':id/total')
  async updateTotal(
    @Param('id') id: string,
    @Body() dto: UpdateTotalDto,
  ): Promise<InventoryResponseDto> {
    const inv = await this.inventoryService.updateTotal(id, dto);
    return this.toResponse(inv);
  }

  @Post(':id/reserve')
  async reserve(
    @Param('id') id: string,
    @Body() dto: ReserveDto,
  ): Promise<InventoryResponseDto> {
    const inv = await this.inventoryService.reserve(id, dto);
    return this.toResponse(inv);
  }

  @Post(':id/release')
  async release(
    @Param('id') id: string,
    @Body() dto: ReleaseDto,
  ): Promise<InventoryResponseDto> {
    const inv = await this.inventoryService.release(id, dto);
    return this.toResponse(inv);
  }

  @Post(':id/consume')
  async consume(
    @Param('id') id: string,
    @Body() dto: ConsumeDto,
  ): Promise<InventoryResponseDto> {
    const inv = await this.inventoryService.consume(id, dto);
    return this.toResponse(inv);
  }

  private toResponse(inv: Inventory): InventoryResponseDto {
    const reservations: ReservationResponseDto[] = inv.inventoryReservations.map((r) => ({
      orderId: r.orderId,
      quantity: r.quantity,
      reservedAt: r.reservedAt,
      expiresAt: r.expiresAt,
    }));

    return {
      id: inv.id.toString(),
      menuItemId: inv.inventoryMenuItemId,
      merchantId: inv.inventoryMerchantId,
      totalQuantity: inv.inventoryTotalQuantity,
      availableQuantity: inv.inventoryAvailableQuantity,
      reservedQuantity: inv.inventoryReservedQuantity,
      lowStockThreshold: inv.inventoryLowStockThreshold,
      reservations,
      isLowStock: inv.isLowStock(),
      isOutOfStock: inv.isOutOfStock(),
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    };
  }
}