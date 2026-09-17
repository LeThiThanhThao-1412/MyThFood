"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, driverApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";

const ROLE_LABELS: Record<string, string> = {
  CONSUMER: "Khách hàng",
  MERCHANT_OWNER: "Chủ nhà hàng",
  DRIVER: "Tài xế",
  ADMIN: "Quản trị viên",
};

const VEHICLE_LABELS: Record<string, string> = {
  MOTORBIKE: "Xe máy",
  CAR: "Ô tô",
  BICYCLE: "Xe đạp",
};

const DRIVER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Chưa kích hoạt",
  SUSPENDED: "Bị tạm khóa",
  BUSY: "Đang giao hàng",
  OFFLINE: "Ngoại tuyến",
  ONLINE: "Trực tuyến",
};

function translatePasswordError(message?: string) {
  const msg = (message || "").toLowerCase();
  if (msg.includes("current password is incorrect")) {
    return "Mật khẩu hiện tại không đúng";
  }
  if (msg.includes("at least 8")) {
    return "Mật khẩu mới phải có ít nhất 8 ký tự";
  }
  if (
    msg.includes("lowercase") ||
    msg.includes("digit") ||
    msg.includes("special character")
  ) {
    return "Mật khẩu mới phải gồm: chữ HOA, chữ thường, số và ký tự đặc biệt";
  }
  if (msg.includes("not found")) {
    return "Không tìm thấy tài khoản";
  }
  return "Lỗi đổi mật khẩu. Vui lòng thử lại";
}

export default function DriverProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        if (user?.id) {
          const res = await driverApi.getByUserId(user.id);
          setDriver(res.data);
        }
      } catch {
        // Bỏ qua nếu chưa có hồ sơ tài xế
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, router, user?.id]);

  async function changePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus(
        "Vui lòng nhập đầy đủ mật khẩu hiện tại, mật khẩu mới và xác nhận mật khẩu mới",
      );
      return;
    }
    if (newPassword.length < 8) {
      setStatus("Mật khẩu mới phải có ít nhất 8 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("Mật khẩu mới và xác nhận không khớp");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setStatus("✅ Đã đổi mật khẩu");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setStatus("❌ " + translatePasswordError(e?.message));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-2xl mx-auto pb-24">
      <header className="bg-[#1a1a2e] px-4 py-4 text-white sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">
            ←
          </Link>
          <h1 className="text-lg font-bold">👤 Hồ sơ tài xế</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="px-4 py-5 space-y-4">
        {status && (
          <div
            className={`p-3 rounded-lg text-sm ${
              status.startsWith("✅")
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {status}
          </div>
        )}

        {/* Thông tin tài khoản */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">👤 Thông tin tài khoản</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-24 shrink-0 text-sm text-gray-500">Họ tên</span>
              <span className="font-medium text-gray-800">
                {driver?.fullName || user?.fullName || "—"}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-24 shrink-0 text-sm text-gray-500">SĐT</span>
              <span className="font-medium text-gray-800">
                {driver?.phone || user?.phone || "—"}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-24 shrink-0 text-sm text-gray-500">Email</span>
              <span className="font-medium text-gray-800">
                {driver?.email || user?.email || "—"}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-24 shrink-0 text-sm text-gray-500">Vai trò</span>
              <span className="font-medium text-gray-800">
                {(user?.roles || [])
                  .map((r) => ROLE_LABELS[r] || r)
                  .join(", ")}
              </span>
            </div>
          </div>
        </div>

        {/* Thông tin xe */}
        {driver && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="font-bold text-lg mb-4">🛵 Thông tin xe</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-24 shrink-0 text-sm text-gray-500">Loại xe</span>
                <span className="font-medium text-gray-800">
                  {VEHICLE_LABELS[driver.vehicleType] || driver.vehicleType}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-24 shrink-0 text-sm text-gray-500">Biển số</span>
                <span className="font-medium text-gray-800">
                  {driver.licensePlate || "—"}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-24 shrink-0 text-sm text-gray-500">Trạng thái</span>
                <span className="font-medium text-gray-800">
                  {DRIVER_STATUS_LABELS[driver.status] || driver.status}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-24 shrink-0 text-sm text-gray-500">Đánh giá</span>
                <span className="font-medium text-gray-800">
                  ⭐ {driver.rating ?? 0} ({driver.totalRatings ?? 0} đánh giá)
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-24 shrink-0 text-sm text-gray-500">Đơn đã giao</span>
                <span className="font-medium text-gray-800">
                  {driver.totalDeliveries ?? 0}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Đổi mật khẩu */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">🔐 Đổi mật khẩu</h3>
          <div className="space-y-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Mật khẩu hiện tại"
              className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mật khẩu mới (ít nhất 8 ký tự)"
              className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
            />
            <p className="text-xs text-gray-400 leading-relaxed">
              Mật khẩu mới cần tối thiểu 8 ký tự, gồm chữ HOA, chữ thường, số và
              ký tự đặc biệt (ví dụ: Abc@1234).
            </p>
            <button
              onClick={changePassword}
              disabled={saving}
              className="w-full bg-[#1a1a2e] text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {saving ? "Đang xử lý..." : "Đổi mật khẩu"}
            </button>
          </div>
        </div>

        {/* Đăng xuất */}
        <button
          onClick={() => {
            clearAuth();
            router.push("/");
          }}
          className="w-full bg-white rounded-2xl shadow-sm p-4 text-red-500 font-semibold text-sm hover:bg-red-50"
        >
          Đăng xuất
        </button>
      </main>

      {/* Bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/dashboard"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🏠</span>
          <span>Trang chủ</span>
        </Link>
        <Link
          href="/profile"
          className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
        >
          <span className="text-[22px]">👤</span>
          <span>Tài khoản</span>
        </Link>
      </nav>
    </div>
  );
}
