import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { MenuCategory } from "../domain/menu-category.entity";
import { MenuCategoryEntity } from "./menu-category.entity";

@Injectable()
export class MenuCategoryRepository {
  constructor(
    @InjectRepository(MenuCategoryEntity)
    private readonly repo: TypeOrmRepo<MenuCategoryEntity>,
  ) {}

  async findByMerchantId(merchantId: string): Promise<MenuCategory[]> {
    const entities = await this.repo.find({
      where: { merchant_id: merchantId },
      order: { sort_order: "ASC", created_at: "ASC" },
    });
    return entities.map((e) =>
      MenuCategory.rehydrate({
        id: e.id,
        merchantId: e.merchant_id,
        name: e.name,
        sortOrder: e.sort_order,
      }),
    );
  }

  async findById(merchantId: string, id: string): Promise<MenuCategory | null> {
    const e = await this.repo.findOne({
      where: { id, merchant_id: merchantId },
    });
    if (!e) return null;
    return MenuCategory.rehydrate({
      id: e.id,
      merchantId: e.merchant_id,
      name: e.name,
      sortOrder: e.sort_order,
    });
  }

  async save(merchantId: string, category: MenuCategory): Promise<void> {
    const entity = new MenuCategoryEntity();
    entity.id = category.id;
    entity.merchant_id = merchantId;
    entity.name = category.name;
    entity.sort_order = category.sortOrder;
    await this.repo.save(entity);
  }

  async delete(merchantId: string, id: string): Promise<void> {
    await this.repo.softDelete({ id, merchant_id: merchantId });
  }
}
