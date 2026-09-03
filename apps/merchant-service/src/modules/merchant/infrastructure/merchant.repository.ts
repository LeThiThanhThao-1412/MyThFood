import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository as TypeOrmRepo } from "typeorm";
import { IRepository } from "@mythfood/shared-kernel";
import { Merchant } from "../domain/merchant.aggregate";
import { MerchantId } from "../domain/merchant-id";
import { MerchantEntity } from "./merchant.entity";
import { MenuItemEntity } from "./menu-item.entity";
import { OperatingHoursEntity } from "./operating-hours.entity";
import { MerchantDocumentEntity } from "./merchant-document.entity";
import { MerchantMapper } from "./merchant.mapper";

export interface MerchantFindAllOptions {
  status?: string;
  search?: string;
  /** Single category (legacy, kept for backward compatibility). */
  category?: string;
  /** Multi-category filter (OR between categories). */
  categories?: string[];
  minRating?: number;
  openNow?: boolean;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  skip?: number;
  take?: number;
}

export interface MenuSearchOptions {
  q: string;
  category?: string;
  skip?: number;
  take?: number;
}

/** Whitelisted sort keys -> column + default direction (prevents SQL injection). */
const SORT_COLUMNS: Record<
  string,
  { column: string; defaultOrder: "ASC" | "DESC" }
> = {
  rating: { column: "merchant.rating", defaultOrder: "DESC" },
  popular: { column: "merchant.total_orders", defaultOrder: "DESC" },
  newest: { column: "merchant.created_at", defaultOrder: "DESC" },
  name: { column: "merchant.name", defaultOrder: "ASC" },
};

/** Max number of matched dishes attached to each merchant in search results. */
const MAX_MATCHED_ITEMS_PER_MERCHANT = 5;

@Injectable()
export class MerchantRepository implements IRepository<Merchant, MerchantId> {
  /**
   * Whether the `unaccent` extension is installed (enables accent-insensitive
   * search: "pho" finds "Phở"). Detected once, lazily, then cached.
   */
  private unaccentAvailable: boolean | null = null;
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
    // Replace operating hours (delete old then insert new) to avoid duplicates on update
    await this.operatingHoursRepo.delete({
      merchant_id: aggregate.id.toString(),
    });
    if (hoursEntities.length > 0) {
      await this.operatingHoursRepo.save(hoursEntities);
    }

    const docEntities = MerchantMapper.documentsToPersistence(aggregate);
    await this.documentRepo.save(docEntities);
  }

  async findById(id: MerchantId): Promise<Merchant | null> {
    const entity = await this.repository.findOne({
      where: { id: id.toString() },
    });
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
    const entity = await this.repository.findOne({
      where: { user_id: userId },
    });
    if (!entity) {
      return null;
    }
    return this.loadRelatedAndMap(entity);
  }

  async findAll(
    options?: MerchantFindAllOptions,
  ): Promise<{ items: Merchant[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (options?.status) {
      where["status"] = options.status;
    }

    const queryBuilder = this.repository
      .createQueryBuilder("merchant")
      .where(where)
      .andWhere("merchant.deleted_at IS NULL");

    if (options?.search) {
      const like = await this.buildTextMatch([
        "merchant.name",
        "merchant.address",
        "merchant.description",
      ]);
      const menuLike = await this.buildTextMatch(["mi.name", "mi.description"]);
      queryBuilder.andWhere(
        `(${like} OR merchant.id IN (SELECT mi.merchant_id FROM menu_items mi WHERE (${menuLike}) AND mi.deleted_at IS NULL))`,
        { search: `%${options.search}%` },
      );
    }

    // FIX #5: Filter by category. `categories` (multi) takes precedence over the
    // legacy single `category`. Uses array overlap instead of LIKE so that
    // e.g. "ice" no longer falsely matches "rice".
    const categoryList = this.normalizeCategories(
      options?.categories,
      options?.category,
    );
    if (categoryList.length > 0) {
      queryBuilder.andWhere(
        "(LOWER(merchant.primary_category) = ANY(CAST(:cats AS text[])) OR string_to_array(LOWER(COALESCE(merchant.secondary_categories, '')), ',') && CAST(:cats AS text[]))",
        { cats: categoryList },
      );
    }

    // Filter by minimum rating
    if (options?.minRating !== undefined && options.minRating > 0) {
      queryBuilder.andWhere("merchant.rating >= :minRating", {
        minRating: options.minRating,
      });
    }

    // Filter merchants that are open right now
    if (options?.openNow) {
      this.applyOpenNowFilter(queryBuilder);
    }

    this.applySorting(queryBuilder, options?.sortBy, options?.sortOrder);

    if (options?.skip !== undefined) {
      queryBuilder.skip(options.skip);
    }
    if (options?.take !== undefined) {
      queryBuilder.take(options.take);
    }

    const [entities, total] = await queryBuilder.getManyAndCount();

    const items = await this.loadRelatedAndMapMany(entities);
    return { items, total };
  }

  /**
   * Menu items matching a keyword, grouped by merchant id.
   * Executed as a single query to avoid N+1 when enriching a merchant list.
   */
  async findMatchedMenuItems(
    merchantIds: string[],
    search: string,
  ): Promise<Map<string, MenuItemEntity[]>> {
    const grouped = new Map<string, MenuItemEntity[]>();
    if (merchantIds.length === 0 || !search) {
      return grouped;
    }

    const rows = await this.menuItemRepo
      .createQueryBuilder("mi")
      .where("mi.merchant_id IN (:...merchantIds)", { merchantIds })
      .andWhere("mi.deleted_at IS NULL")
      .andWhere("mi.is_available = true")
      .andWhere(await this.buildTextMatch(["mi.name", "mi.description"]), {
        search: `%${search}%`,
      })
      .orderBy("mi.sort_order", "ASC")
      .addOrderBy("mi.name", "ASC")
      .getMany();

    for (const row of rows) {
      const bucket = grouped.get(row.merchant_id) ?? [];
      if (bucket.length < MAX_MATCHED_ITEMS_PER_MERCHANT) {
        bucket.push(row);
      }
      grouped.set(row.merchant_id, bucket);
    }
    return grouped;
  }

  /**
   * Global dish search across all APPROVED merchants.
   * Returns only ids so the application layer can resolve domain objects.
   */
  async searchMenuItems(options: MenuSearchOptions): Promise<{
    rows: { menuItemId: string; merchantId: string }[];
    total: number;
  }> {
    const queryBuilder = this.menuItemRepo
      .createQueryBuilder("mi")
      .innerJoin(MerchantEntity, "m", "m.id = mi.merchant_id")
      .where("mi.deleted_at IS NULL")
      .andWhere("mi.is_available = true")
      .andWhere("m.deleted_at IS NULL")
      .andWhere("m.status = :approved", { approved: "APPROVED" })
      .andWhere(
        await this.buildTextMatch(
          ["mi.name", "mi.description", "mi.category"],
          "q",
        ),
        { q: `%${options.q}%` },
      );

    const categoryList = this.normalizeCategories(undefined, options.category);
    if (categoryList.length > 0) {
      queryBuilder.andWhere(
        "(LOWER(m.primary_category) = ANY(CAST(:cats AS text[])) OR string_to_array(LOWER(COALESCE(m.secondary_categories, '')), ',') && CAST(:cats AS text[]))",
        { cats: categoryList },
      );
    }

    queryBuilder
      .orderBy("mi.is_featured", "DESC")
      .addOrderBy("mi.sort_order", "ASC")
      .addOrderBy("mi.name", "ASC");

    if (options.skip !== undefined) {
      queryBuilder.skip(options.skip);
    }
    if (options.take !== undefined) {
      queryBuilder.take(options.take);
    }

    const [entities, total] = await queryBuilder.getManyAndCount();
    return {
      rows: entities.map((e) => ({
        menuItemId: e.id,
        merchantId: e.merchant_id,
      })),
      total,
    };
  }

  /** Batch-load several merchants (4 queries total instead of 3 per merchant). */
  async findManyByIds(ids: string[]): Promise<Merchant[]> {
    if (ids.length === 0) {
      return [];
    }
    const entities = await this.repository.find({ where: { id: In(ids) } });
    return this.loadRelatedAndMapMany(entities);
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

    return MerchantMapper.toDomain(
      entity,
      menuItems,
      operatingHours,
      documents,
    );
  }

  /**
   * Batch version of `loadRelatedAndMap`: 3 queries for the whole page instead of
   * 3 queries per merchant. Preserves the order of the incoming entities.
   */
  private async loadRelatedAndMapMany(
    entities: MerchantEntity[],
  ): Promise<Merchant[]> {
    if (entities.length === 0) {
      return [];
    }
    const ids = entities.map((e) => e.id);

    const [menuItems, operatingHours, documents] = await Promise.all([
      this.menuItemRepo.find({ where: { merchant_id: In(ids) } }),
      this.operatingHoursRepo.find({ where: { merchant_id: In(ids) } }),
      this.documentRepo.find({ where: { merchant_id: In(ids) } }),
    ]);

    const menuByMerchant = this.groupBy(menuItems, (mi) => mi.merchant_id);
    const hoursByMerchant = this.groupBy(
      operatingHours,
      (oh) => oh.merchant_id,
    );
    const docsByMerchant = this.groupBy(documents, (d) => d.merchant_id);

    return entities.map((entity) =>
      MerchantMapper.toDomain(
        entity,
        menuByMerchant.get(entity.id) ?? [],
        hoursByMerchant.get(entity.id) ?? [],
        docsByMerchant.get(entity.id) ?? [],
      ),
    );
  }

  private groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = keyOf(row);
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(row);
      } else {
        map.set(key, [row]);
      }
    }
    return map;
  }

  /**
   * True when the `unaccent` extension is installed, enabling accent-insensitive
   * search ("pho" matches "Phở"). Result is cached after the first probe; falls
   * back to plain ILIKE when the extension is unavailable.
   */
  private async hasUnaccent(): Promise<boolean> {
    if (this.unaccentAvailable === null) {
      try {
        const rows = await this.repository.query(
          "SELECT 1 FROM pg_extension WHERE extname = 'unaccent' LIMIT 1",
        );
        this.unaccentAvailable = Array.isArray(rows) && rows.length > 0;
      } catch {
        this.unaccentAvailable = false;
      }
    }
    return this.unaccentAvailable;
  }

  /**
   * Builds `(col1 ILIKE :param OR col2 ILIKE :param ...)`, wrapping both sides in
   * `unaccent()` when available so diacritics are ignored in both directions.
   */
  private async buildTextMatch(
    columns: string[],
    param = "search",
  ): Promise<string> {
    const useUnaccent = await this.hasUnaccent();
    const term = useUnaccent ? `unaccent(:${param})` : `:${param}`;
    const parts = columns.map((col) =>
      useUnaccent
        ? `unaccent(COALESCE(${col}, '')) ILIKE ${term}`
        : `${col} ILIKE ${term}`,
    );
    return `(${parts.join(" OR ")})`;
  }

  /** Lower-cased, de-duplicated category keys (multi takes precedence). */
  private normalizeCategories(
    categories?: string[],
    category?: string,
  ): string[] {
    const source =
      categories && categories.length > 0
        ? categories
        : category
          ? [category]
          : [];
    const cleaned = source
      .map((c) => String(c).trim().toLowerCase())
      .filter((c) => c.length > 0);
    return Array.from(new Set(cleaned));
  }

  /**
   * Mirrors `Merchant.isOpen()` in SQL so that `openNow` filtering stays
   * consistent with the `isOpenNow` field returned to clients:
   *   manual flag ON + status APPROVED + today's hours exist + not closed
   *   + current time inside the window (overnight windows supported).
   * A matching `special_date` row always takes precedence over `day_of_week`.
   */
  private applyOpenNowFilter(
    queryBuilder: ReturnType<TypeOrmRepo<MerchantEntity>["createQueryBuilder"]>,
  ): void {
    const now = new Date();
    // `getTodayHours()` builds the special-date key from the ISO (UTC) date and
    // the weekday/time from local time — keep the exact same behaviour here.
    const today = now.toISOString().split("T")[0];
    const dayOfWeek = now.getDay();
    const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}:00`;

    queryBuilder
      .andWhere("merchant.is_open = true")
      .andWhere("merchant.status = :openApproved", {
        openApproved: "APPROVED",
      })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM operating_hours oh
          WHERE oh.merchant_id = merchant.id
            AND oh.is_closed = false
            AND oh.open_time IS NOT NULL
            AND oh.close_time IS NOT NULL
            AND (
              oh.special_date = CAST(:today AS date)
              OR (
                oh.day_of_week = :dayOfWeek
                AND NOT EXISTS (
                  SELECT 1 FROM operating_hours sd
                  WHERE sd.merchant_id = merchant.id
                    AND sd.special_date = CAST(:today AS date)
                )
              )
            )
            AND (
              (oh.open_time <= oh.close_time
                AND CAST(:nowTime AS time) >= oh.open_time
                AND CAST(:nowTime AS time) <= oh.close_time)
              OR (oh.open_time > oh.close_time
                AND (CAST(:nowTime AS time) >= oh.open_time
                  OR CAST(:nowTime AS time) <= oh.close_time))
            )
        )`,
        { today, dayOfWeek, nowTime },
      );
  }

  /** Applies a whitelisted sort; defaults to newest first (previous behaviour). */
  private applySorting(
    queryBuilder: ReturnType<TypeOrmRepo<MerchantEntity>["createQueryBuilder"]>,
    sortBy?: string,
    sortOrder?: "ASC" | "DESC",
  ): void {
    const sort = sortBy ? SORT_COLUMNS[sortBy] : undefined;
    if (!sort) {
      queryBuilder.orderBy("merchant.created_at", "DESC");
      return;
    }

    const direction = sortOrder ?? sort.defaultOrder;
    queryBuilder.orderBy(
      sort.column,
      direction,
      direction === "DESC" ? "NULLS LAST" : "NULLS FIRST",
    );
    // Stable tie-breaker so pagination never returns duplicates
    queryBuilder.addOrderBy("merchant.created_at", "DESC");
  }
}
