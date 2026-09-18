"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import TopNav from "@/components/TopNav";

const ROLE_LABELS: Record<string, string> = {
  CONSUMER: "Khách hàng",
  MERCHANT_OWNER: "Chủ nhà hàng",
  DRIVER: "Tài xế",
  ADMIN: "Quản trị viên",
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

export default function MerchantProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

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

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <TopNav />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
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
          <h3 className="font-bold text-lg mb-4">👤 Hồ sơ tài khoản</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-20 shrink-0 text-sm text-gray-500">
                Họ tên
              </span>
              <span className="font-medium text-gray-800">
                {user?.fullName || "—"}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-20 shrink-0 text-sm text-gray-500">SĐT</span>
              <span className="font-medium text-gray-800">
                {user?.phone || "—"}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-20 shrink-0 text-sm text-gray-500">Email</span>
              <span className="font-medium text-gray-800">
                {user?.email || "—"}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-20 shrink-0 text-sm text-gray-500">
                Vai trò
              </span>
              <span className="font-medium text-gray-800">
                {(user?.roles || []).map((r) => ROLE_LABELS[r] || r).join(", ")}
              </span>
            </div>
          </div>
        </div>

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
    </div>
  );
}
