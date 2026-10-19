import { ForbiddenException } from "@nestjs/common";
import { REJECTION_RETENTION_DAYS, User } from "../user/domain/user.aggregate";

/**
 * Mã lỗi trả về cho client khi tài khoản không được phép đăng nhập.
 * FE dùng `code` + `account` để hiển thị thông báo khóa/từ chối kèm lý do.
 */
export type AccountBlockCode =
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_BANNED"
  | "ACCOUNT_REJECTED"
  | "ACCOUNT_DELETED"
  | "ACCOUNT_INACTIVE";

export interface AccountBlockInfo {
  /** Trạng thái tài khoản tại thời điểm đăng nhập. */
  status: string;
  /** Lý do khóa / từ chối (nếu có). */
  reason: string | null;
  /** true = khóa vĩnh viễn (không có ngày mở khóa). */
  permanent: boolean;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  rejectedAt: string | null;
  /** Ngày tài khoản bị từ chối sẽ bị xóa (rejectedAt + 3 ngày). */
  deleteAt: string | null;
}

export interface AccountBlockPayload {
  statusCode: number;
  code: AccountBlockCode;
  message: string;
  account: AccountBlockInfo;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Định dạng ngày giờ theo múi giờ Việt Nam (UTC+7) dạng `dd/mm/yyyy HH:mm`. */
export function formatVnDateTime(date: Date): string {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = shifted.getUTCFullYear();
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mi = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/** Định dạng ngày theo múi giờ Việt Nam (UTC+7) dạng `dd/mm/yyyy`. */
export function formatVnDate(date: Date): string {
  return formatVnDateTime(date).split(" ")[0] ?? "";
}

function withReason(message: string, reason: string | null): string {
  return reason ? `${message} Lý do: ${reason}` : message;
}

/**
 * Tạo payload thông báo khóa/từ chối cho tài khoản không được đăng nhập.
 * Trả về `null` khi tài khoản đang ACTIVE (được đăng nhập bình thường).
 */
export function buildAccountBlockPayload(
  user: User,
): AccountBlockPayload | null {
  const base = {
    suspendedAt: user.suspensionAt?.toISOString() ?? null,
    suspendedUntil: user.suspensionUntil?.toISOString() ?? null,
    rejectedAt: user.rejectionAt?.toISOString() ?? null,
    deleteAt: user.rejectionDeleteAt?.toISOString() ?? null,
  };

  switch (user.currentStatus) {
    case "SUSPENDED": {
      const reason = user.suspensionReason;
      const until = user.suspensionUntil;
      const permanent = !until;
      const message = withReason(
        permanent
          ? "Tài khoản của bạn đã bị khóa vĩnh viễn và không thể đăng nhập."
          : `Tài khoản của bạn đã bị khóa đến ${formatVnDateTime(until!)}.`,
        reason,
      );
      return {
        statusCode: 403,
        code: "ACCOUNT_SUSPENDED",
        message,
        account: {
          status: "SUSPENDED",
          reason,
          permanent,
          ...base,
        },
      };
    }

    case "BANNED": {
      const reason = user.suspensionReason ?? user.rejectionReason;
      return {
        statusCode: 403,
        code: "ACCOUNT_BANNED",
        message: withReason(
          "Tài khoản của bạn đã bị khóa vĩnh viễn và không thể đăng nhập.",
          reason,
        ),
        account: {
          status: "BANNED",
          reason,
          permanent: true,
          ...base,
        },
      };
    }

    case "REJECTED": {
      const reason = user.rejectionReason;
      const deleteAt = user.rejectionDeleteAt;
      const message = withReason(
        deleteAt
          ? `Hồ sơ đăng ký của bạn đã bị từ chối. Tài khoản sẽ bị xóa sau ngày ${formatVnDate(deleteAt)} (${REJECTION_RETENTION_DAYS} ngày kể từ khi bị từ chối) và không thể đăng nhập.`
          : "Hồ sơ đăng ký của bạn đã bị từ chối.",
        reason,
      );
      return {
        statusCode: 403,
        code: "ACCOUNT_REJECTED",
        message,
        account: {
          status: "REJECTED",
          reason,
          permanent: false,
          ...base,
        },
      };
    }

    case "INACTIVE": {
      return {
        statusCode: 403,
        code: "ACCOUNT_INACTIVE",
        message:
          "Tài khoản của bạn chưa được kích hoạt. Vui lòng chờ quản trị viên phê duyệt hoặc liên hệ bộ phận hỗ trợ.",
        account: {
          status: "INACTIVE",
          reason: null,
          permanent: false,
          ...base,
        },
      };
    }

    default:
      return null;
  }
}

/** Trả về ForbiddenException (403) kèm thông tin khóa/từ chối, hoặc null. */
export function accountBlockException(user: User): ForbiddenException | null {
  const payload = buildAccountBlockPayload(user);
  return payload ? new ForbiddenException(payload) : null;
}

/**
 * Tài khoản bị từ chối đã quá 3 ngày lưu trữ → đã bị xóa khỏi hệ thống.
 * Trả về lỗi 403 để FE hiển thị thông báo thay vì lỗi sai mật khẩu chung chung.
 */
export function rejectedAccountDeletedException(
  user: User,
): ForbiddenException {
  const rejectedAt = user.rejectionAt;
  const deleteAt = user.rejectionDeleteAt;
  const reason = user.rejectionReason;
  return new ForbiddenException({
    statusCode: 403,
    code: "ACCOUNT_DELETED",
    message: withReason(
      `Tài khoản của bạn đã bị từ chối và bị xóa sau ${REJECTION_RETENTION_DAYS} ngày nên không thể đăng nhập. Vui lòng đăng ký lại nếu muốn tiếp tục sử dụng.`,
      reason,
    ),
    account: {
      status: "DELETED",
      reason,
      permanent: true,
      suspendedAt: null,
      suspendedUntil: null,
      rejectedAt: rejectedAt?.toISOString() ?? null,
      deleteAt: deleteAt?.toISOString() ?? null,
    },
  } satisfies AccountBlockPayload);
}
