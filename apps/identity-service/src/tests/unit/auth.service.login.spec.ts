/// <reference types="jest" />

import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../../modules/auth/auth.service";
import { User, UserRole } from "../../modules/user/domain/user.aggregate";
import { Password } from "../../modules/user/domain/password.vo";

const PHONE = "+84901234600";
const RAW_PASSWORD = "Test@Pass123";

describe("AuthService.login — account status notices", () => {
  let password: Password;
  let currentUser: User | null;
  let purgeById: jest.Mock;
  let service: AuthService;

  beforeAll(async () => {
    const result = await Password.create(RAW_PASSWORD);
    password = result.value;
  });

  beforeEach(() => {
    currentUser = User.register({
      phoneNumber: PHONE,
      fullName: "Status User",
      password,
      roles: ["MERCHANT_OWNER"] as UserRole[],
    }).value;

    purgeById = jest.fn().mockResolvedValue(undefined);

    const repository = {
      findByPhone: jest.fn(async () => currentUser),
      findById: jest.fn(async () => currentUser),
      save: jest.fn(async () => undefined),
      updateLastLogin: jest.fn(async () => undefined),
      activateById: jest.fn(async () => undefined),
      purgeById,
    };

    const jwtService = {
      sign: jest.fn((payload: any, options?: any) =>
        options ? "refresh-token" : "access-token",
      ),
      decode: jest.fn(() => ({ exp: 1234567890 })),
    };

    service = new AuthService(
      jwtService as any,
      {} as any,
      repository as any,
      {
        syncExternalAccountStatus: jest.fn(),
      } as any,
    );
  });

  it("should return tokens for an ACTIVE account", async () => {
    const tokens = await service.login(PHONE, RAW_PASSWORD);
    expect(tokens.accessToken).toBe("access-token");
    expect(tokens.refreshToken).toBe("refresh-token");
  });

  it("should reject login with a lock-until date and reason when suspended", async () => {
    currentUser!.suspend(5, "Vi phạm chính sách");

    await expect(service.login(PHONE, RAW_PASSWORD)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    try {
      await service.login(PHONE, RAW_PASSWORD);
    } catch (err: any) {
      const response = err.getResponse();
      expect(response.code).toBe("ACCOUNT_SUSPENDED");
      expect(response.account.permanent).toBe(false);
      expect(response.account.reason).toBe("Vi phạm chính sách");
      expect(response.account.suspendedUntil).toBe(
        currentUser!.suspensionUntil?.toISOString(),
      );
      expect(response.message).toContain("đến");
    }
  });

  it("should report a permanent lock when no unlock date is set", async () => {
    currentUser!.suspend(undefined, "Gian lận");

    try {
      await service.login(PHONE, RAW_PASSWORD);
      throw new Error("Expected login to fail");
    } catch (err: any) {
      const response = err.getResponse();
      expect(response.code).toBe("ACCOUNT_SUSPENDED");
      expect(response.account.permanent).toBe(true);
      expect(response.message).toContain("vĩnh viễn");
      expect(response.message).toContain("Gian lận");
    }
  });

  it("should report rejection with reason and deletion date", async () => {
    currentUser!.reject("Giấy phép kinh doanh không hợp lệ");

    try {
      await service.login(PHONE, RAW_PASSWORD);
      throw new Error("Expected login to fail");
    } catch (err: any) {
      const response = err.getResponse();
      expect(response.code).toBe("ACCOUNT_REJECTED");
      expect(response.account.reason).toBe("Giấy phép kinh doanh không hợp lệ");
      expect(response.account.deleteAt).toBe(
        currentUser!.rejectionDeleteAt?.toISOString(),
      );
      expect(response.message).toContain("3 ngày");
    }
  });

  it("should purge and block an account rejected more than 3 days ago", async () => {
    const rejected = User.rehydrate(currentUser!.id, {
      phoneNumber: PHONE,
      email: null,
      fullName: "Status User",
      password,
      roles: ["MERCHANT_OWNER"],
      status: "REJECTED",
      deviceId: null,
      lastLoginAt: null,
      rejectedAt: new Date(Date.now() - 4 * 86_400_000),
      rejectReason: "Hồ sơ giả",
    });
    currentUser = rejected;

    await expect(service.login(PHONE, RAW_PASSWORD)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(purgeById).toHaveBeenCalledTimes(1);

    try {
      await service.login(PHONE, RAW_PASSWORD);
    } catch (err: any) {
      expect(err.getResponse().code).toBe("ACCOUNT_DELETED");
    }
  });

  it("should not reveal the account status when the password is wrong", async () => {
    currentUser!.suspend(5, "Vi phạm chính sách");

    await expect(service.login(PHONE, "Wrong@Pass123")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
