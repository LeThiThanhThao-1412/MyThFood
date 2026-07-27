import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
export class UserAdminService {
  constructor(private readonly userRepository: UserRepository) {}

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

    const allowedTransitions =
      validTransitions[user.currentStatus] ?? [];
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
      user.suspend();
    }

    await this.userRepository.save(user);

    return this.toAdminResponse(user);
  }

  private toAdminResponse(user: User): UserAdminResponseDto {
    return {
      id: user.id.toString(),
      phone: user.phone,
      fullName: user.displayName,
      email: user.emailAddress ?? null,
      roles: user.userRoles,
      status: user.currentStatus,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}