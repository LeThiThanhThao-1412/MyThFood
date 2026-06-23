import {
  AggregateRoot,
  Result,
  DomainError,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { UserId } from "./user-id";
import { Password } from "./password.vo";
import { UserRegisteredEvent } from "./events/user-registered.event";

export type UserRole =
  | "CONSUMER"
  | "DRIVER"
  | "MERCHANT_OWNER"
  | "MERCHANT_STAFF"
  | "ADMIN";

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "BANNED";

export interface UserProps {
  phoneNumber: string;
  email: string | null;
  fullName: string;
  password: Password;
  roles: UserRole[];
  status: UserStatus;
  deviceId: string | null;
  lastLoginAt: Date | null;
}

export class User extends AggregateRoot<UserId> {
  private phoneNumber: string;
  private email: string | null;
  private fullName: string;
  private password: Password;
  private roles: UserRole[];
  private status: UserStatus;
  private deviceId: string | null;
  private lastLoginAt: Date | null;

  private constructor(id: UserId, props: UserProps) {
    super(id);
    this.phoneNumber = props.phoneNumber;
    this.email = props.email;
    this.fullName = props.fullName;
    this.password = props.password;
    this.roles = props.roles;
    this.status = props.status;
    this.deviceId = props.deviceId;
    this.lastLoginAt = props.lastLoginAt;
  }

  /**
   * Register a new user.
   */
  public static register(props: {
    phoneNumber: string;
    email?: string;
    fullName: string;
    password: Password;
    roles?: UserRole[];
    deviceId?: string;
    ipAddress?: string;
  }): Result<User, DomainError> {
    // Business rule: phone number is mandatory
    if (!props.phoneNumber || props.phoneNumber.trim().length === 0) {
      return Result.fail(
        new BusinessRuleViolationError("Phone number is required"),
      );
    }

    // Business rule: default role is CONSUMER
    const roles: UserRole[] =
      props.roles && props.roles.length > 0 ? props.roles : ["CONSUMER"];

    const user = new User(UserId.create(), {
      phoneNumber: props.phoneNumber,
      email: props.email ?? null,
      fullName: props.fullName,
      password: props.password,
      roles,
      status: "ACTIVE",
      deviceId: props.deviceId ?? null,
      lastLoginAt: null,
    });

    // Domain event
    user.addDomainEvent(
      new UserRegisteredEvent(user.id, {
        userId: user.id.toString(),
        phoneNumber: props.phoneNumber,
        email: props.email ?? null,
        fullName: props.fullName,
        roles,
        deviceId: props.deviceId,
        ipAddress: props.ipAddress,
      }),
    );

    return Result.ok(user);
  }

  /**
   * Rehydrate a User from persistence (no events emitted).
   */
  public static rehydrate(id: UserId, props: UserProps): User {
    return new User(id, props);
  }

  /**
   * Change password.
   */
  public changePassword(newPassword: Password): void {
    this.password = newPassword;
    this.markUpdated();
  }

  /**
   * Verify password.
   */
  public async verifyPassword(plainText: string): Promise<boolean> {
    return this.password.verify(plainText);
  }

  /**
   * Record a successful login.
   */
  public recordLogin(): void {
    this.lastLoginAt = new Date();
    this.markUpdated();
  }

  /**
   * Suspend the user account.
   */
  public suspend(): void {
    if (this.status === "BANNED") {
      throw new BusinessRuleViolationError("Cannot suspend a banned user");
    }
    this.status = "SUSPENDED";
    this.markUpdated();
  }

  /**
   * Ban the user account permanently.
   */
  public ban(): void {
    this.status = "BANNED";
    this.markUpdated();
  }

  /**
   * Activate the user account.
   */
  public activate(): void {
    this.status = "ACTIVE";
    this.markUpdated();
  }

  // Getters
  get phone(): string {
    return this.phoneNumber;
  }

  get emailAddress(): string | null {
    return this.email;
  }

  get displayName(): string {
    return this.fullName;
  }

  get userRoles(): UserRole[] {
    return [...this.roles];
  }

  get currentStatus(): UserStatus {
    return this.status;
  }

  get passwordHash(): string {
    return this.password.hash;
  }

  get device(): string | null {
    return this.deviceId;
  }

  get lastLogin(): Date | null {
    return this.lastLoginAt;
  }

  public hasRole(role: UserRole): boolean {
    return this.roles.includes(role);
  }

  public isActive(): boolean {
    return this.status === "ACTIVE";
  }
}
