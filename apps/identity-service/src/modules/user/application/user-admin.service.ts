import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
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

  constructor(private readonly userRepository: UserRepository) {}

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
