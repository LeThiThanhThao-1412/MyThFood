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
import { REJECTION_RETENTION_DAYS, User } from "../domain/user.aggregate";
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
      this.sweepExpiredRejections().catch((err) =>
        this.logger.warn(
          `Rejected-account purge failed: ${err?.message ?? String(err)}`,
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
    } else {
      throw new BadRequestException(
        `Unsupported user status: ${status}. Use PATCH /auth/users/:id/reject to reject an account.`,
      );
    }

    await this.userRepository.save(user);

    // Đồng bộ khóa/mở khóa sang merchant/driver (nếu user là chủ nhà hàng/tài xế).
    if (status === "SUSPENDED" || status === "ACTIVE") {
      await this.syncExternalAccountStatus(user, status, reason, durationDays);
    }

    return this.toAdminResponse(user);
  }

  /**
   * Từ chối tài khoản/hồ sơ đăng ký (nhà hàng hoặc tài xế).
   *
   * Tài khoản bị từ chối sẽ thấy thông báo từ chối + lý do khi đăng nhập và
   * bị xóa vĩnh viễn sau 3 ngày (xem `sweepExpiredRejections`).
   */
  async rejectUser(id: string, reason?: string): Promise<UserAdminResponseDto> {
    const userId = UserId.from(id);
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    if (user.currentStatus === "BANNED") {
      throw new BadRequestException("Cannot reject a banned user");
    }

    user.reject(reason);
    await this.userRepository.save(user);

    await this.syncExternalAccountStatus(user, "REJECTED", reason);

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

    await this.syncExternalAccountStatus(user, "ACTIVE");

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
          // Mở khóa lại nhà hàng/tài xế tương ứng sau khi hết hạn khóa.
          await this.syncExternalAccountStatus(user, "ACTIVE");
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
   * Quét và xóa vĩnh viễn các tài khoản bị từ chối đã quá 3 ngày.
   * Sau khi xóa, số điện thoại được giải phóng để người dùng có thể đăng ký lại.
   */
  async sweepExpiredRejections(): Promise<number> {
    const deadline = new Date(
      Date.now() - REJECTION_RETENTION_DAYS * 86_400_000,
    );
    const users = await this.userRepository.findRejectedBefore(deadline);
    let count = 0;
    for (const user of users) {
      try {
        await this.userRepository.purgeById(user.id);
        count += 1;
      } catch (err: any) {
        this.logger.warn(
          `Failed to purge rejected user ${user.id.toString()}: ${err?.message ?? String(err)}`,
        );
      }
    }
    if (count > 0) {
      this.logger.log(
        `Purged ${count} rejected account(s) after ${REJECTION_RETENTION_DAYS}-day retention`,
      );
    }
    return count;
  }

  /**
   * Đồng bộ trạng thái khóa/mở khóa/từ chối sang merchant-service/driver-service
   * khi user là MERCHANT_OWNER hoặc DRIVER. Best-effort (fire-and-forget).
   *
   * Public để AuthService dùng lại khi tài khoản được tự mở khóa lúc đăng nhập.
   */
  async syncExternalAccountStatus(
    user: User,
    status: string,
    reason?: string,
    durationDays?: number,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    const userId = user.id.toString();
    const merchantStatus =
      status === "SUSPENDED"
        ? "SUSPENDED"
        : status === "REJECTED"
          ? "REJECTED"
          : "APPROVED";
    const driverStatus =
      status === "SUSPENDED"
        ? "SUSPENDED"
        : status === "REJECTED"
          ? "REJECTED"
          : "ACTIVE";
    const payload = { status: merchantStatus, reason, durationDays };

    if (user.userRoles.includes("MERCHANT_OWNER")) {
      const url =
        process.env.MERCHANT_SERVICE_URL || "http://merchant-service:3003";
      try {
        await firstValueFrom(
          this.httpService.patch(
            `${url}/api/v1/merchants/user/${userId}/status`,
            payload,
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
            { status: driverStatus, reason, durationDays },
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
      rejectedAt: user.rejectionAt,
      rejectReason: user.rejectionReason,
      rejectionDeleteAt: user.rejectionDeleteAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
