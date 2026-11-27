"use client";

import { formatAccountDate } from "@mythfood/frontend-shared";

export interface MerchantLockWarning {
  id?: string;
  title?: string;
  message?: string;
  totalOrders?: number;
  cancelledOrders?: number;
  totalComplaints?: number;
  validComplaints?: number;
  complaintRate?: string | number;
}

/**
 * Màn hình chặn toàn bộ Merchant Portal khi tài khoản/nhà hàng bị khóa.
 *
 * Hiển thị tối đa thông tin có được:
 *  - Lý do khóa (từ identity-service hoặc cảnh báo khiếu nại).
 *  - Thời hạn khóa (nếu xác định được).
 *  - Số liệu khiếu nại dẫn đến quyết định khóa.
 */
export default function MerchantLockScreen({
  merchantName,
  reason,
  suspendedUntil,
  permanent = false,
  warning,
  onLogout,
  onRefresh,
  refreshing = false,
}: {
  merchantName?: string;
  reason?: string | null;
  suspendedUntil?: string | null;
  permanent?: boolean;
  warning?: MerchantLockWarning | null;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const untilText = formatAccountDate(suspendedUntil);
  const rate = Number(warning?.complaintRate ?? 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 flex flex-col">
      <header className="bg-[#1a1a2e] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <span className="text-lg sm:text-xl font-extrabold">
            MyTh<span className="text-[#ff6b35]">Food</span>
            <span className="ml-2 text-xs font-medium text-white/50">
              Partner Portal
            </span>
          </span>
          <div className="flex items-center gap-3">
            {merchantName && (
              <span className="hidden sm:block text-sm text-white/70 max-w-[220px] truncate">
                {merchantName}
              </span>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 sm:px-8 py-8 text-white text-center">
            <div className="text-5xl mb-3">{permanent ? "🚫" : "🔒"}</div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {permanent
                ? "Tài khoản nhà hàng đã bị khóa vĩnh viễn"
                : "Tài khoản nhà hàng đang bị tạm khóa"}
            </h1>
            {merchantName && (
              <p className="mt-2 text-white/85 text-sm">{merchantName}</p>
            )}
          </div>

          <div className="px-6 sm:px-8 py-7 space-y-5">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold mb-1">Lý do khóa</p>
              <p>
                {reason ||
                  warning?.message ||
                  "Tài khoản nhà hàng đang bị tạm khóa. Vui lòng liên hệ bộ phận hỗ trợ MyThFood để biết thêm chi tiết."}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-gray-500 mb-1">Thời hạn khóa</p>
                <p className="font-semibold text-gray-800">
                  {permanent
                    ? "Vĩnh viễn"
                    : untilText
                      ? `Đến ${untilText}`
                      : "Đang cập nhật"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-gray-500 mb-1">Trạng thái</p>
                <p className="font-semibold text-red-600">
                  {permanent ? "Đã khóa vĩnh viễn" : "Tạm khóa"}
                </p>
              </div>
            </div>

            {warning && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold mb-2">
                  ⚠️ Số liệu khiếu nại dẫn đến khóa
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-amber-700">Tổng đơn</p>
                    <p className="font-bold">{warning.totalOrders ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-700">Đơn hủy</p>
                    <p className="font-bold">
                      {warning.cancelledOrders ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-700">Khiếu nại hợp lệ</p>
                    <p className="font-bold">
                      {warning.validComplaints ?? 0}/
                      {warning.totalComplaints ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-700">Tỉ lệ</p>
                    <p className="font-bold">
                      {warning.complaintRate != null
                        ? `${(rate * 100).toFixed(2)}%`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 leading-relaxed">
              Trong thời gian bị khóa, các chức năng quản lý đơn hàng, menu,
              khuyến mãi và ví của nhà hàng tạm thời không khả dụng. Khi hết
              thời hạn khóa, tài khoản sẽ được tự động mở khóa và bạn có thể
              tiếp tục kinh doanh.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="flex-1 bg-[#ff6b35] text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50"
              >
                {refreshing ? "Đang kiểm tra..." : "Kiểm tra lại trạng thái"}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex-1 bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl font-semibold hover:bg-gray-200 transition"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-[#1a1a2e] text-white/60 py-5">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs">
          © {new Date().getFullYear()} MyThFood Merchant · Cần hỗ trợ? Liên hệ
          bộ phận chăm sóc đối tác MyThFood.
        </div>
      </footer>
    </div>
  );
}
