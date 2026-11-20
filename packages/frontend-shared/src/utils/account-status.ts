import { ApiError } from "@mythfood/api-client";

/**
 * Mã lỗi do identity-service trả về khi tài khoản không được phép đăng nhập.
 * Khớp với `AccountBlockCode` ở backend.
 */
export type AccountBlockCode =
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_BANNED"
  | "ACCOUNT_REJECTED"
  | "ACCOUNT_DELETED"
  | "ACCOUNT_INACTIVE";

export interface AccountBlockInfo {
  code: AccountBlockCode;
  /** Thông báo đầy đủ do backend tạo (đã bao gồm lý do & mốc thời gian). */
  message: string;
  status: string | null;
  reason: string | null;
  /** true = khóa vĩnh viễn (không có ngày mở khóa). */
  permanent: boolean;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  rejectedAt: string | null;
  /** Ngày tài khoản bị từ chối sẽ bị xóa (rejectedAt + 3 ngày). */
  deleteAt: string | null;
}

interface AccountBlockBody {
  code?: string;
  message?: string;
  account?: {
    status?: string;
    reason?: string | null;
    permanent?: boolean;
    suspendedAt?: string | null;
    suspendedUntil?: string | null;
    rejectedAt?: string | null;
    deleteAt?: string | null;
  };
}

/** Dữ liệu trạng thái tài khoản trả về từ `/auth/me` (hoặc merchant/driver profile). */
export interface AccountProfileLike {
  status?: string | null;
  suspendedUntil?: string | null;
  suspendReason?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
  rejectionDeleteAt?: string | null;
}

/** Key sessionStorage dùng để chuyển thông báo khóa/từ chối sang trang login. */
export const ACCOUNT_BLOCK_STORAGE_KEY = "mythfood-account-block";

const REJECTION_RETENTION_MS = 3 * 86_400_000;

const KNOWN_CODES: AccountBlockCode[] = [
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_BANNED",
  "ACCOUNT_REJECTED",
  "ACCOUNT_DELETED",
  "ACCOUNT_INACTIVE",
];

/**
 * Đọc thông tin khóa/từ chối từ lỗi đăng nhập (403 + `code: ACCOUNT_*`).
 * Trả về `null` nếu lỗi không phải lỗi trạng thái tài khoản.
 */
export function getAccountBlockInfo(err: unknown): AccountBlockInfo | null {
  if (!(err instanceof ApiError)) return null;

  const body = err.details as AccountBlockBody | undefined;
  if (!body || typeof body !== "object" || typeof body.code !== "string") {
    return null;
  }
  if (!KNOWN_CODES.includes(body.code as AccountBlockCode)) {
    return null;
  }

  const account = body.account ?? {};
  return {
    code: body.code as AccountBlockCode,
    message: body.message || err.message,
    status: account.status ?? null,
    reason: account.reason ?? null,
    permanent: account.permanent === true,
    suspendedAt: account.suspendedAt ?? null,
    suspendedUntil: account.suspendedUntil ?? null,
    rejectedAt: account.rejectedAt ?? null,
    deleteAt: account.deleteAt ?? null,
  };
}

/** Định dạng `dd/mm/yyyy HH:mm` theo múi giờ trình duyệt. */
export function formatAccountDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Tạo thông báo khóa/từ chối từ dữ liệu `/auth/me` hoặc profile merchant/driver.
 * Trả về `null` khi tài khoản bình thường (ACTIVE).
 */
export function getAccountBlockFromProfile(
  profile: AccountProfileLike | null | undefined,
): AccountBlockInfo | null {
  if (!profile?.status) return null;

  const deleteAt =
    profile.rejectionDeleteAt ??
    (profile.rejectedAt
      ? new Date(
          new Date(profile.rejectedAt).getTime() + REJECTION_RETENTION_MS,
        ).toISOString()
      : null);

  switch (profile.status) {
    case "SUSPENDED": {
      const permanent = !profile.suspendedUntil;
      return {
        code: "ACCOUNT_SUSPENDED",
        message: permanent
          ? "Tài khoản của bạn đã bị khóa vĩnh viễn và không thể đăng nhập."
          : "Tài khoản của bạn đang bị khóa.",
        status: "SUSPENDED",
        reason: profile.suspendReason ?? null,
        permanent,
        suspendedAt: null,
        suspendedUntil: profile.suspendedUntil ?? null,
        rejectedAt: null,
        deleteAt: null,
      };
    }
    case "BANNED":
      return {
        code: "ACCOUNT_BANNED",
        message:
          "Tài khoản của bạn đã bị khóa vĩnh viễn và không thể đăng nhập.",
        status: "BANNED",
        reason: profile.suspendReason ?? profile.rejectReason ?? null,
        permanent: true,
        suspendedAt: null,
        suspendedUntil: null,
        rejectedAt: null,
        deleteAt: null,
      };
    case "REJECTED":
      return {
        code: "ACCOUNT_REJECTED",
        message: "Hồ sơ đăng ký của bạn đã bị từ chối.",
        status: "REJECTED",
        reason: profile.rejectReason ?? null,
        permanent: false,
        suspendedAt: null,
        suspendedUntil: null,
        rejectedAt: profile.rejectedAt ?? null,
        deleteAt,
      };
    case "INACTIVE":
      return {
        code: "ACCOUNT_INACTIVE",
        message:
          "Tài khoản của bạn chưa được kích hoạt. Vui lòng chờ quản trị viên phê duyệt hoặc liên hệ bộ phận hỗ trợ.",
        status: "INACTIVE",
        reason: null,
        permanent: false,
        suspendedAt: null,
        suspendedUntil: null,
        rejectedAt: null,
        deleteAt: null,
      };
    default:
      return null;
  }
}

/** Lưu thông báo để trang login hiển thị sau khi bị đăng xuất cưỡng bức. */
export function storeAccountBlock(info: AccountBlockInfo): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      ACCOUNT_BLOCK_STORAGE_KEY,
      JSON.stringify(info),
    );
  } catch {
    // Bỏ qua nếu trình duyệt chặn sessionStorage.
  }
}

/** Đọc và xóa thông báo đã lưu (dùng ở màn hình đăng nhập). */
export function consumeStoredAccountBlock(): AccountBlockInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACCOUNT_BLOCK_STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(ACCOUNT_BLOCK_STORAGE_KEY);
    const parsed = JSON.parse(raw) as AccountBlockInfo;
    return parsed?.code ? parsed : null;
  } catch {
    return null;
  }
}
