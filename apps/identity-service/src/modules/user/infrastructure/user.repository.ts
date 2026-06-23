import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { IRepository } from "@mythfood/shared-kernel";
import { User } from "../domain/user.aggregate";
import { UserId } from "../domain/user-id";
import { UserEntity } from "./user.entity";
import { UserMapper } from "./user.mapper";

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
