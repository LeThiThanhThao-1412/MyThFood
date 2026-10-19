/// <reference types="jest" />

import {
  buildAccountBlockPayload,
  formatVnDate,
  formatVnDateTime,
  rejectedAccountDeletedException,
} from "../../modules/auth/account-block.util";
import { User } from "../../modules/user/domain/user.aggregate";
import { Password } from "../../modules/user/domain/password.vo";

describe("Account block payload", () => {
  let password: Password;

  beforeAll(async () => {
    const result = await Password.create("Test@Pass123");
    password = result.value;
  });

  function createUser() {
    return User.register({
      phoneNumber: "+84901234590",
      fullName: "Blocked User",
      password,
      roles: ["MERCHANT_OWNER"],
    }).value;
  }

  it("should return null for an active account", () => {
    expect(buildAccountBlockPayload(createUser())).toBeNull();
  });

  it("should describe a timed suspension with reason and unlock date", () => {
    const user = createUser();
    user.suspend(3, "Vi phạm chính sách");

    const payload = buildAccountBlockPayload(user);
    expect(payload).not.toBeNull();
    expect(payload?.code).toBe("ACCOUNT_SUSPENDED");
    expect(payload?.account.permanent).toBe(false);
    expect(payload?.account.reason).toBe("Vi phạm chính sách");
    expect(payload?.account.suspendedUntil).toBe(
      user.suspensionUntil?.toISOString(),
    );
    expect(payload?.message).toContain("Vi phạm chính sách");
    expect(payload?.message).toContain("đến");
  });

  it("should describe a permanent suspension", () => {
    const user = createUser();
    user.suspend(undefined, "Gian lận");

    const payload = buildAccountBlockPayload(user);
    expect(payload?.code).toBe("ACCOUNT_SUSPENDED");
    expect(payload?.account.permanent).toBe(true);
    expect(payload?.message).toContain("vĩnh viễn");
  });

  it("should describe a rejected application with deletion date", () => {
    const user = createUser();
    user.reject("Giấy phép kinh doanh không hợp lệ");

    const payload = buildAccountBlockPayload(user);
    expect(payload?.code).toBe("ACCOUNT_REJECTED");
    expect(payload?.account.reason).toBe("Giấy phép kinh doanh không hợp lệ");
    expect(payload?.account.rejectedAt).toBe(user.rejectionAt?.toISOString());
    expect(payload?.account.deleteAt).toBe(
      user.rejectionDeleteAt?.toISOString(),
    );
    expect(payload?.message).toContain("bị từ chối");
    expect(payload?.message).toContain("3 ngày");
  });

  it("should build an ACCOUNT_DELETED error for expired rejections", () => {
    const user = createUser();
    user.reject("Hồ sơ giả");

    const exception = rejectedAccountDeletedException(user);
    const response = exception.getResponse() as any;
    expect(exception.getStatus()).toBe(403);
    expect(response.code).toBe("ACCOUNT_DELETED");
    expect(response.account.reason).toBe("Hồ sơ giả");
  });

  it("should format Vietnamese dates in UTC+7", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(formatVnDateTime(date)).toBe("01/01/2026 07:00");
    expect(formatVnDate(date)).toBe("01/01/2026");
  });
});
