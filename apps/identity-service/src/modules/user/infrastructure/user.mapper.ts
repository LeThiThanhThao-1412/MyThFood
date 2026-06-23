import { UserId } from "../domain/user-id";
import { Password } from "../domain/password.vo";
import { User, UserRole, UserStatus } from "../domain/user.aggregate";
import { UserEntity } from "./user.entity";

/**
 * Maps between Domain (User aggregate) and Persistence (UserEntity).
 * Part of the Infrastructure layer (not the Domain).
 */
export class UserMapper {
  /**
   * Convert a TypeORM entity to a domain aggregate.
   */
  public static toDomain(entity: UserEntity): User {
    const id = UserId.from(entity.id);
    const password = Password.fromHash(entity.password_hash);
    const roles = (
      Array.isArray(entity.roles)
        ? entity.roles
        : (entity.roles ?? "").split(",").filter(Boolean)
    ) as UserRole[];

    return User.rehydrate(id, {
      phoneNumber: entity.phone_number,
      email: entity.email,
      fullName: entity.full_name,
      password,
      roles,
      status: entity.status as UserStatus,
      deviceId: entity.device_id,
      lastLoginAt: entity.last_login_at,
    });
  }

  /**
   * Convert a domain aggregate to a TypeORM entity.
   */
  public static toPersistence(user: User): UserEntity {
    const entity = new UserEntity();
    entity.id = user.id.toString();
    entity.phone_number = user.phone;
    entity.email = user.emailAddress;
    entity.full_name = user.displayName;
    entity.password_hash = user.passwordHash;
    entity.roles = user.userRoles.join(",");
    entity.status = user.currentStatus;
    entity.device_id = user.device;
    entity.last_login_at = user.lastLogin;
    return entity;
  }
}
