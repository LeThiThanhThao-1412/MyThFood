"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, merchantApi } from "@mythfood/api-client";
import {
  useAuth,
  canAccessApp,
  AccountBlockNotice,
  getAccountBlockInfo,
  consumeStoredAccountBlock,
  storeAccountBlock,
} from "@mythfood/frontend-shared";
import type { AccountBlockInfo } from "@mythfood/frontend-shared";

export default function MerchantLoginPage() {
  const router = useRouter();
  const { login, logout } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [block, setBlock] = useState<AccountBlockInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Hiển thị thông báo khi bị đăng xuất cưỡng bức do tài khoản bị khóa/từ chối.
  useEffect(() => {
    const stored = consumeStoredAccountBlock();
    if (stored) setBlock(stored);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBlock(null);
    setLoading(true);
    try {
      const data = await login({ phoneNumber: phone, password });
      if (!canAccessApp(data?.user?.roles, "MERCHANT")) {
        logout();
        setError("Tài khoản không có quyền truy cập Partner Portal");
        return;
      }

      // Identity có thể chưa kịp đồng bộ trạng thái khóa sang merchant-service
      // (đồng bộ best-effort) ⇒ kiểm tra thêm hồ sơ nhà hàng trước khi vào portal.
      try {
        const mRes: any = await merchantApi
          .getByUserId(data.user.id)
          .catch(() => null);
        const merchant: any = (mRes as any)?.data ?? mRes;
        if (
          merchant?.status === "SUSPENDED" ||
          merchant?.status === "REJECTED"
        ) {
          const meRes: any = await authApi.me().catch(() => null);
          const profile: any = (meRes as any)?.data ?? meRes;
          const suspended = merchant.status === "SUSPENDED";
          const info: AccountBlockInfo = suspended
            ? {
                code: "ACCOUNT_SUSPENDED",
                message:
                  "Tài khoản nhà hàng của bạn đang bị tạm khóa và không thể sử dụng Merchant Portal.",
                status: "SUSPENDED",
                reason: profile?.suspendReason ?? null,
                permanent:
                  profile?.status === "SUSPENDED" && !profile?.suspendedUntil,
                suspendedAt: null,
                suspendedUntil: profile?.suspendedUntil ?? null,
                rejectedAt: null,
                deleteAt: null,
              }
            : {
                code: "ACCOUNT_REJECTED",
                message:
                  "Hồ sơ đăng ký nhà hàng của bạn đã bị từ chối và không thể sử dụng Merchant Portal.",
                status: "REJECTED",
                reason: profile?.rejectReason ?? merchant.rejectReason ?? null,
                permanent: false,
                suspendedAt: null,
                suspendedUntil: null,
                rejectedAt: profile?.rejectedAt ?? merchant.rejectedAt ?? null,
                deleteAt: profile?.rejectionDeleteAt ?? null,
              };
          storeAccountBlock(info);
          logout();
          setBlock(info);
          return;
        }
      } catch {
        // Không chặn đăng nhập nếu merchant-service tạm thời không phản hồi.
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      const info = getAccountBlockInfo(err);
      if (info) {
        setBlock(info);
        return;
      }
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">🍜 MyThFood</h1>
          <p className="text-gray-500 mt-2">Đăng nhập Partner Portal</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          {block && <AccountBlockNotice info={block} />}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Số điện thoại
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+84901234567"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mật khẩu
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-11 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-lg text-gray-400 hover:text-gray-600"
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Chưa có tài khoản?{" "}
          <Link
            href="/register"
            className="text-blue-500 hover:underline font-medium"
          >
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
