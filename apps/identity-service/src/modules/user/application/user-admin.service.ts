import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { UserRepository } from "../infrastructure/user.repository";
import { User } from "../domain/user.aggregate";
import { UserId } from "../domain/user-id";
import {
  QueryUsersDto,
  UserAdminResponseDto,
  PaginatedUsersResponseDto,
} from "./dtos/user-admin.dto";

@Injectable()
export class UserAdminService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserAdminService.name);
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  /** Chu kỳ quét tự mở khóa các tài khoản SUSPENDED hết hạn (ms). */
  private static readonly SWEEP_INTERVAL_MS = 60_000;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly httpService: HttpService,
  ) {}

  onModuleInit(): void {
    this.sweepInterval = setInterval(() => {
      this.sweepExpiredSuspensions().catch((err) =>
        this.logger.warn(
          `Auto-unlock sweep failed: ${err?.message ?? String(err)}`,
        ),
      );
    }, UserAdminService.SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  async listUsers(query: QueryUsersDto): Promise<PaginatedUsersResponseDto> {
    const result = await this.userRepository.findAll({
      skip: query.skip ?? 0,
      take: query.take ?? 20,
      role: query.role,
      status: query.status,
      search: query.search,
    });

    return {
      items: result.items.map((user) => this.toAdminResponse(user)),
      total: result.total,
    };
  }

  async getUserById(id: string): Promise<UserAdminResponseDto> {
    const userId = UserId.from(id);
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return this.toAdminResponse(user);
  }

  async updateUserStatus(
    id: string,
    status: string,
    durationDays?: number,
    reason?: string,
  ): Promise<UserAdminResponseDto> {
    const userId = UserId.from(id);
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const validTransitions: Record<string, string[]> = {
      ACTIVE: ["INACTIVE", "SUSPENDED"],
      INACTIVE: ["ACTIVE"],
      SUSPENDED: ["ACTIVE"],
    };

    const allowedTransitions = validTransitions[user.currentStatus] ?? [];
    if (!allowedTransitions.includes(status)) {
      throw new BadRequestException(
        `Cannot transition user from ${user.currentStatus} to ${status}`,
      );
    }

    if (status === "ACTIVE") {
      user.activate();
    } else if (status === "INACTIVE") {
      user.deactivate();
    } else if (status === "SUSPENDED") {
      user.suspend(durationDays, reason);
    }

    await this.userRepository.save(user);

    // Đồng bộ khóa/mở khóa sang merchant/driver (nếu user là chủ nhà hàng/tài xế).
    if (status === "SUSPENDED" || status === "ACTIVE") {
      await this.syncMerchantDriverStatus(user, status);
    }

    return this.toAdminResponse(user);
  }

  async unlockUser(id: string): Promise<UserAdminResponseDto> {
    const userId = UserId.from(id);
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (user.currentStatus === "BANNED") {
      throw new BadRequestException("Cannot unlock a banned user");
    }

    user.activate();
    await this.userRepository.save(user);

    await this.syncMerchantDriverStatus(user, "ACTIVE");

    return this.toAdminResponse(user);
  }

  /** Quét và tự mở khóa các tài khoản SUSPENDED đã hết hạn. */
  async sweepExpiredSuspensions(): Promise<number> {
    const users = await this.userRepository.findExpiredSuspended(new Date());
    let count = 0;
    for (const user of users) {
      try {
        if (user.autoUnlockIfExpired()) {
          await this.userRepository.save(user);
          count += 1;
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to auto-unlock user ${user.id.toString()}: ${err?.message ?? String(err)}`,
        );
      }
    }
    if (count > 0) {
      this.logger.log(`Auto-unlocked ${count} expired suspended account(s)`);
    }
    return count;
  }

  /**
   * Đồng bộ trạng thái khóa/mở khóa sang merchant-service/driver-service khi user
   * là MERCHANT_OWNER hoặc DRIVER. Best-effort (fire-and-forget).
   */
  private async syncMerchantDriverStatus(
    user: User,
    status: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    const userId = user.id.toString();
    const merchantStatus = status === "SUSPENDED" ? "SUSPENDED" : "APPROVED";
    const driverStatus = status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";

    if (user.userRoles.includes("MERCHANT_OWNER")) {
      const url =
        process.env.MERCHANT_SERVICE_URL || "http://merchant-service:3003";
      try {
        await firstValueFrom(
          this.httpService.patch(
            `${url}/api/v1/merchants/user/${userId}/status`,
            { status: merchantStatus },
            { headers: { "x-service-key": serviceKey } },
          ),
        );
      } catch (err: any) {
        this.logger.warn(
          `Sync merchant failed for user ${userId}: ${err?.message}`,
        );
      }
    }

    if (user.userRoles.includes("DRIVER")) {
      const url =
        process.env.DRIVER_SERVICE_URL || "http://driver-service:3007";
      try {
        await firstValueFrom(
          this.httpService.patch(
            `${url}/api/v1/drivers/user/${userId}/status`,
            { status: driverStatus },
            { headers: { "x-service-key": serviceKey } },
          ),
        );
      } catch (err: any) {
        this.logger.warn(
          `Sync driver failed for user ${userId}: ${err?.message}`,
        );
      }
    }
  }

  private toAdminResponse(user: User): UserAdminResponseDto {
    return {
      id: user.id.toString(),
      phone: user.phone,
      fullName: user.displayName,
      email: user.emailAddress ?? null,
      roles: user.userRoles,
      status: user.currentStatus,
      suspendedUntil: user.suspensionUntil,
      suspendedAt: user.suspensionAt,
      suspendReason: user.suspensionReason,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
