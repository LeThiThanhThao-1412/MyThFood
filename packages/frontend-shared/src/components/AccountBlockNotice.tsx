"use client";

import type { AccountBlockInfo } from "../utils/account-status";
import { formatAccountDate } from "../utils/account-status";

const TITLES: Record<string, string> = {
  ACCOUNT_SUSPENDED: "🔒 Tài khoản đã bị khóa",
  ACCOUNT_BANNED: "🚫 Tài khoản đã bị khóa vĩnh viễn",
  ACCOUNT_REJECTED: "❌ Hồ sơ đăng ký đã bị từ chối",
  ACCOUNT_DELETED: "🗑️ Tài khoản đã bị xóa",
  ACCOUNT_INACTIVE: "⏳ Tài khoản chưa được kích hoạt",
};

/**
 * Thẻ thông báo hiển thị ở màn hình đăng nhập khi tài khoản bị khóa/từ chối.
 * Nêu rõ: khóa đến ngày nào hay vĩnh viễn, lý do, và (nếu bị từ chối) ngày xóa.
 */
export default function AccountBlockNotice({
  info,
}: {
  info: AccountBlockInfo;
}) {
  const title = TITLES[info.code] ?? "⚠️ Không thể đăng nhập";
  const isRejected = info.code === "ACCOUNT_REJECTED";
  const isDeleted = info.code === "ACCOUNT_DELETED";
  const isSuspended =
    info.code === "ACCOUNT_SUSPENDED" || info.code === "ACCOUNT_BANNED";

  const lockText = isSuspended
    ? info.permanent || !info.suspendedUntil
      ? "Khóa vĩnh viễn"
      : `Khóa đến ${formatAccountDate(info.suspendedUntil)}`
    : null;
  const rejectedAtText = formatAccountDate(info.rejectedAt);
  const deleteAtText = formatAccountDate(info.deleteAt);

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <p className="font-bold">{title}</p>

      {info.reason ? (
        <p className="mt-2">
          <span className="font-semibold">Lý do: </span>
          {info.reason}
        </p>
      ) : (
        <p className="mt-2">{info.message}</p>
      )}

      {lockText && (
        <p className="mt-1">
          <span className="font-semibold">Thời hạn: </span>
          {lockText}
        </p>
      )}

      {isRejected && (
        <>
          {rejectedAtText && (
            <p className="mt-1">
              <span className="font-semibold">Từ chối lúc: </span>
              {rejectedAtText}
            </p>
          )}
          {deleteAtText && (
            <p className="mt-1">
              <span className="font-semibold">Tài khoản sẽ bị xóa sau: </span>
              {deleteAtText} (3 ngày kể từ khi bị từ chối)
            </p>
          )}
          <p className="mt-2 text-xs text-red-600">
            Sau thời hạn trên, tài khoản sẽ bị xóa và không thể đăng nhập. Vui
            lòng liên hệ bộ phận hỗ trợ MyThFood nếu cần khiếu nại.
          </p>
        </>
      )}

      {isDeleted && (
        <p className="mt-2 text-xs text-red-600">
          Tài khoản đã bị xóa khỏi hệ thống sau 3 ngày kể từ khi bị từ chối.
        </p>
      )}
    </div>
  );
}
