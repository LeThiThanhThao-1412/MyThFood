import { User } from "../../modules/user/domain/user.aggregate";
import { Password } from "../../modules/user/domain/password.vo";
import { UserId } from "../../modules/user/domain/user-id";

describe("User Aggregate", () => {
  let password: Password;

  beforeAll(async () => {
    const result = await Password.create("TestPass123");
    password = result.isSuccess
      ? result.value
      : (() => {
          throw new Error("Failed to create password");
        })();
  });

  describe("register", () => {
    it("should register a new user with CONSUMER role by default", () => {
      const result = User.register({
        phoneNumber: "+84901234567",
        fullName: "Nguyen Van A",
        password,
      });

      expect(result.isSuccess).toBe(true);
      const user = result.value;
      expect(user.phone).toBe("+84901234567");
      expect(user.displayName).toBe("Nguyen Van A");
      expect(user.userRoles).toEqual(["CONSUMER"]);
      expect(user.currentStatus).toBe("ACTIVE");
      expect(user.isActive()).toBe(true);
    });

    it("should register a user with specified roles", () => {
      const result = User.register({
        phoneNumber: "+84901234568",
        fullName: "Tran Thi B",
        password,
        roles: ["DRIVER"],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.userRoles).toEqual(["DRIVER"]);
    });

    it("should emit a UserRegisteredEvent", () => {
      const result = User.register({
        phoneNumber: "+84901234569",
        fullName: "Le Van C",
        password,
        deviceId: "device-123",
        ipAddress: "192.168.1.1",
      });

      expect(result.isSuccess).toBe(true);
      const user = result.value;
      expect(user.hasUncommittedEvents()).toBe(true);
      expect(user.pendingEventCount).toBe(1);

      const events = user.pullDomainEvents();
      expect(events.length).toBe(1);
      const event = events[0];
      expect(event?.eventType).toBe("com.mythfood.identity.user.registered");
    });

    it("should fail when phone number is empty", () => {
      const result = User.register({
        phoneNumber: "",
        fullName: "Test",
        password,
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Phone number is required");
    });
  });

  describe("domain behavior", () => {
    it("should verify correct password", async () => {
      const result = User.register({
        phoneNumber: "+84901234570",
        fullName: "Test User",
        password,
      });

      const user = result.value;
      const isValid = await user.verifyPassword("TestPass123");
      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const result = User.register({
        phoneNumber: "+84901234571",
        fullName: "Test User 2",
        password,
      });

      const user = result.value;
      const isValid = await user.verifyPassword("WrongPassword");
      expect(isValid).toBe(false);
    });

    it("should suspend an active user", () => {
      const result = User.register({
        phoneNumber: "+84901234572",
        fullName: "Test User 3",
        password,
      });

      const user = result.value;
      user.suspend();
      expect(user.currentStatus).toBe("SUSPENDED");
      expect(user.isActive()).toBe(false);
    });

    it("should ban a user", () => {
      const result = User.register({
        phoneNumber: "+84901234573",
        fullName: "Test User 4",
        password,
      });

      const user = result.value;
      user.ban();
      expect(user.currentStatus).toBe("BANNED");
    });

    it("should record login timestamp", () => {
      const result = User.register({
        phoneNumber: "+84901234574",
        fullName: "Test User 5",
        password,
      });

      const user = result.value;
      expect(user.lastLogin).toBeNull();
      user.recordLogin();
      expect(user.lastLogin).not.toBeNull();
      expect(user.lastLogin).toBeInstanceOf(Date);
    });

    it("should check role membership", () => {
      const result = User.register({
        phoneNumber: "+84901234575",
        fullName: "Test User 6",
        password,
        roles: ["CONSUMER", "ADMIN"],
      });

      const user = result.value;
      expect(user.hasRole("CONSUMER")).toBe(true);
      expect(user.hasRole("ADMIN")).toBe(true);
      expect(user.hasRole("DRIVER")).toBe(false);
    });
  });

  describe("rehydrate", () => {
    it("should rehydrate without emitting events", () => {
      const id = UserId.create();
      const user = User.rehydrate(id, {
        phoneNumber: "+84901234576",
        email: "test@example.com",
        fullName: "Rehydrated User",
        password,
        roles: ["CONSUMER"],
        status: "ACTIVE",
        deviceId: null,
        lastLoginAt: null,
      });

      expect(user.id.equals(id)).toBe(true);
      expect(user.phone).toBe("+84901234576");
      expect(user.emailAddress).toBe("test@example.com");
      expect(user.hasUncommittedEvents()).toBe(false);
    });
  });
});
