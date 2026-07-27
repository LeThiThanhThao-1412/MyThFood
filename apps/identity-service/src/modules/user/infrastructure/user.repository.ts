import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo, Like } from "typeorm";
import { IRepository } from "@mythfood/shared-kernel";
import { User } from "../domain/user.aggregate";
import { UserId } from "../domain/user-id";
import { UserEntity } from "./user.entity";
import { UserMapper } from "./user.mapper";

export interface UserFilterQuery {
  skip: number;
  take: number;
  role?: string;
  status?: string;
  search?: string;
}

@Injectable()
export class UserRepository implements IRepository<User, UserId> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: TypeOrmRepo<UserEntity>,
  ) {}

  async save(aggregate: User): Promise<void> {
    const entity = UserMapper.toPersistence(aggregate);
    await this.repository.save(entity);
  }

  async findById(id: UserId): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { id: id.toString() },
    });
    if (!entity) {
      return null;
    }
    return UserMapper.toDomain(entity);
  }

  async findByIdOrFail(id: UserId): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new Error(`User with id ${id.toString()} not found`);
    }
    return user;
  }

  async findByPhone(phoneNumber: string): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { phone_number: phoneNumber },
    });
    if (!entity) {
      return null;
    }
    return UserMapper.toDomain(entity);
  }

  async findAll(
    query: UserFilterQuery,
  ): Promise<{ items: User[]; total: number }> {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.role) {
      where.roles = Like(`%${query.role}%`);
    }

    if (query.search) {
      // Search by phone or full_name
      return this.searchUsers(query);
    }

    const [entities, total] = await this.repository.findAndCount({
      where,
      skip: query.skip,
      take: query.take,
      order: { created_at: "DESC" },
    });

    return {
      items: entities.map((entity) => UserMapper.toDomain(entity)),
      total,
    };
  }

  private async searchUsers(
    query: UserFilterQuery,
  ): Promise<{ items: User[]; total: number }> {
    const qb = this.repository.createQueryBuilder("user");

    if (query.status) {
      qb.andWhere("user.status = :status", { status: query.status });
    }
    if (query.role) {
      qb.andWhere("user.roles LIKE :role", { role: `%${query.role}%` });
    }

    qb.andWhere(
      "(user.phone_number ILIKE :search OR user.full_name ILIKE :search)",
      { search: `%${query.search}%` },
    );

    qb.skip(query.skip).take(query.take).orderBy("user.created_at", "DESC");

    const [entities, total] = await qb.getManyAndCount();

    return {
      items: entities.map((entity) => UserMapper.toDomain(entity)),
      total,
    };
  }

  async exists(id: UserId): Promise<boolean> {
    const count = await this.repository.count({ where: { id: id.toString() } });
    return count > 0;
  }

  async delete(aggregate: User): Promise<void> {
    await this.repository.softDelete(aggregate.id.toString());
  }

  async deleteById(id: UserId): Promise<void> {
    await this.repository.softDelete(id.toString());
  }
}
