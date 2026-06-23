import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepo } from 'typeorm';
import { IRepository } from '@mythfood/shared-kernel';
import { Merchant } from '../domain/merchant.aggregate';
import { MerchantId } from '../domain/merchant-id';
import { MerchantEntity } from './merchant.entity';
import { MenuItemEntity } from './menu-item.entity';
import { OperatingHoursEntity } from './operating-hours.entity';
import { MerchantDocumentEntity } from './merchant-document.entity';
import { MerchantMapper } from './merchant.mapper';

@Injectable()
export class MerchantRepository implements IRepository<Merchant, MerchantId> {
  constructor(
    @InjectRepository(MerchantEntity)
    private readonly repository: TypeOrmRepo<MerchantEntity>,
    @InjectRepository(MenuItemEntity)
    private readonly menuItemRepo: TypeOrmRepo<MenuItemEntity>,
    @InjectRepository(OperatingHoursEntity)
    private readonly operatingHoursRepo: TypeOrmRepo<OperatingHoursEntity>,
    @InjectRepository(MerchantDocumentEntity)
    private readonly documentRepo: TypeOrmRepo<MerchantDocumentEntity>,
  ) {}

  async save(aggregate: Merchant): Promise<void> {
    const entity = MerchantMapper.toPersistence(aggregate);
    await this.repository.save(entity);

    // Save related entities
    const menuItemEntities = MerchantMapper.menuItemsToPersistence(aggregate);
    await this.menuItemRepo.save(menuItemEntities);

    const hoursEntities = MerchantMapper.operatingHoursToPersistence(aggregate);
    await this.operatingHoursRepo.save(hoursEntities);

    const docEntities = MerchantMapper.documentsToPersistence(aggregate);
    await this.documentRepo.save(docEntities);
  }

  async findById(id: MerchantId): Promise<Merchant | null> {
    const entity = await this.repository.findOne({ where: { id: id.toString() } });
    if (!entity) {
      return null;
    }
    return this.loadRelatedAndMap(entity);
  }

  async findByIdOrFail(id: MerchantId): Promise<Merchant> {
    const merchant = await this.findById(id);
    if (!merchant) {
      throw new Error(`Merchant with id ${id.toString()} not found`);
    }
    return merchant;
  }

  async findByUserId(userId: string): Promise<Merchant | null> {
    const entity = await this.repository.findOne({ where: { user_id: userId } });
    if (!entity) {
      return null;
    }
    return this.loadRelatedAndMap(entity);
  }

  async findAll(options?: {
    status?: string;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Merchant[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (options?.status) {
      where['status'] = options.status;
    }

    const queryBuilder = this.repository.createQueryBuilder('merchant')
      .where(where)
      .andWhere('merchant.deleted_at IS NULL')
      .orderBy('merchant.created_at', 'DESC');

    if (options?.search) {
      queryBuilder.andWhere(
        '(merchant.name ILIKE :search OR merchant.address ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    if (options?.skip !== undefined) {
      queryBuilder.skip(options.skip);
    }
    if (options?.take !== undefined) {
      queryBuilder.take(options.take);
    }

    const [entities, total] = await queryBuilder.getManyAndCount();

    const items = await Promise.all(entities.map((e) => this.loadRelatedAndMap(e)));
    return { items, total };
  }

  async exists(id: MerchantId): Promise<boolean> {
    const count = await this.repository.count({ where: { id: id.toString() } });
    return count > 0;
  }

  async delete(aggregate: Merchant): Promise<void> {
    await this.repository.softDelete(aggregate.id.toString());
  }

  async deleteById(id: MerchantId): Promise<void> {
    await this.repository.softDelete(id.toString());
  }

  private async loadRelatedAndMap(entity: MerchantEntity): Promise<Merchant> {
    const menuItems = await this.menuItemRepo.find({
      where: { merchant_id: entity.id },
    });
    const operatingHours = await this.operatingHoursRepo.find({
      where: { merchant_id: entity.id },
    });
    const documents = await this.documentRepo.find({
      where: { merchant_id: entity.id },
    });

    return MerchantMapper.toDomain(entity, menuItems, operatingHours, documents);
  }
}