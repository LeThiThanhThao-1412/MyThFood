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
