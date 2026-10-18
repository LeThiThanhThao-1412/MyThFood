import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  DELIVERY_OPTIONS,
  DeliveryOption,
  DeliveryOptionPolicy,
  getDeliveryOptionPolicy,
} from "../order/domain/delivery-option";
import { DeliveryOptionConfigEntity } from "./delivery-option-config.entity";
import { UpdateDeliveryOptionConfigDto } from "./dtos/delivery-option-config.dto";

const CACHE_TTL_MS = 30_000;

@Injectable()
export class DeliveryOptionConfigService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryOptionConfigService.name);
  private cache: DeliveryOptionConfigEntity[] | null = null;
  private cacheAt = 0;

  constructor(
    @InjectRepository(DeliveryOptionConfigEntity)
    private readonly repo: Repository<DeliveryOptionConfigEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSeeded();
    } catch (err: any) {
      this.logger.warn(
        `Không seed được delivery_option_configs: ${err?.message}`,
      );
    }
  }

  private async ensureSeeded(): Promise<void> {
    const existing = await this.repo.find({ select: ["option"] });
    const missing = DELIVERY_OPTIONS.filter(
      (option) => !existing.some((row) => row.option === option),
    );
    if (missing.length === 0) return;

    const rows = missing.map((option) => {
      const policy = getDeliveryOptionPolicy(option);
      return this.repo.create({
        option,
        fee_factor: policy.feeFactor,
        fixed_surcharge: policy.fixedSurcharge,
        min_fee: policy.minFee,
        max_fee: policy.maxFee,
        prep_minutes: policy.prepMinutes,
        eta_buffer_minutes: policy.etaBufferMinutes,
        dispatch_timeout_seconds: policy.dispatchTimeoutSeconds,
        driver_response_timeout_seconds: policy.driverResponseTimeoutSeconds,
        max_stacked_orders: policy.maxStackedOrders,
      });
    });
    await this.repo.save(rows);
    this.logger.log(
      `Đã seed ${missing.length} cấu hình phương thức giao hàng mặc định`,
    );
  }

  /** Danh sách cấu hình (cache 30s, tự sắp SAVER → FAST → PRIORITY). */
  async list(force = false): Promise<DeliveryOptionConfigEntity[]> {
    const now = Date.now();
    if (!force && this.cache && now - this.cacheAt < CACHE_TTL_MS) {
      return this.cache;
    }
    const rows = await this.repo.find();
    const orderIndex = new Map(
      DELIVERY_OPTIONS.map((option, index) => [option, index]),
    );
    rows.sort(
      (a, b) =>
        (orderIndex.get(a.option as DeliveryOption) ?? 99) -
        (orderIndex.get(b.option as DeliveryOption) ?? 99),
    );
    this.cache = rows;
    this.cacheAt = now;
    return rows;
  }

  /** Policy hiện hành, hợp nhất DB với mặc định env. */
  async getPolicy(option: DeliveryOption): Promise<DeliveryOptionPolicy> {
    const base = getDeliveryOptionPolicy(option);
    let rows: DeliveryOptionConfigEntity[] = [];
    try {
      rows = await this.list();
    } catch (err: any) {
      this.logger.warn(
        `Không đọc được delivery_option_configs, dùng mặc định env: ${err?.message}`,
      );
      return base;
    }
    const row = rows.find((r) => r.option === option);
    if (!row) return base;

    return {
      ...base,
      feeFactor: Number(row.fee_factor),
      fixedSurcharge: Number(row.fixed_surcharge),
      minFee: Number(row.min_fee),
      maxFee: Number(row.max_fee),
      prepMinutes: Number(row.prep_minutes),
      etaBufferMinutes: Number(row.eta_buffer_minutes),
      dispatchTimeoutSeconds: Number(row.dispatch_timeout_seconds),
      driverResponseTimeoutSeconds: Number(row.driver_response_timeout_seconds),
      maxStackedOrders: Number(row.max_stacked_orders),
    };
  }

  async update(
    optionRaw: string,
    dto: UpdateDeliveryOptionConfigDto,
  ): Promise<DeliveryOptionPolicy> {
    const option = (optionRaw ?? "").trim().toUpperCase() as DeliveryOption;
    if (!DELIVERY_OPTIONS.includes(option)) {
      throw new BadRequestException(
        `Phương thức giao hàng không hợp lệ: ${optionRaw}`,
      );
    }
    const row = await this.repo.findOne({ where: { option } });
    if (!row) {
      throw new NotFoundException(
        `Không tìm thấy cấu hình cho phương thức ${option}`,
      );
    }

    if (dto.feeFactor != null) row.fee_factor = dto.feeFactor;
    if (dto.fixedSurcharge != null) row.fixed_surcharge = dto.fixedSurcharge;
    if (dto.minFee != null) row.min_fee = dto.minFee;
    if (dto.maxFee != null) row.max_fee = dto.maxFee;
    if (dto.prepMinutes != null) row.prep_minutes = dto.prepMinutes;
    if (dto.etaBufferMinutes != null)
      row.eta_buffer_minutes = dto.etaBufferMinutes;
    if (dto.dispatchTimeoutSeconds != null)
      row.dispatch_timeout_seconds = dto.dispatchTimeoutSeconds;
    if (dto.driverResponseTimeoutSeconds != null)
      row.driver_response_timeout_seconds = dto.driverResponseTimeoutSeconds;
    if (dto.maxStackedOrders != null)
      row.max_stacked_orders = dto.maxStackedOrders;

    if (Number(row.min_fee) > Number(row.max_fee)) {
      throw new BadRequestException("minFee không được lớn hơn maxFee");
    }

    await this.repo.save(row);
    this.cache = null;
    this.cacheAt = 0;
    return this.getPolicy(option);
  }
}
