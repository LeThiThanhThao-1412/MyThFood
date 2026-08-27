"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { consumerApi, authApi, uploadApi } from "@mythfood/api-client";
import { useAuthStore, useLocationStore } from "@mythfood/frontend-shared";

const ADDR_TYPE_META: Record<string, { icon: string; label: string }> = {
  HOME: { icon: "🏠", label: "Nhà" },
  WORK: { icon: "🏢", label: "Chỗ Làm" },
  OTHER: { icon: "📍", label: "Khác" },
};

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const { location } = useLocationStore();

  const [consumer, setConsumer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [avatar, setAvatar] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrType, setAddrType] = useState<"HOME" | "WORK" | "OTHER">("HOME");
  const [addrText, setAddrText] = useState("");

  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        let profile: any = null;
        try {
          const res: any = await consumerApi.getByUserId(user?.id || "");
          profile = res?.data || res;
        } catch {
          profile = null;
        }

        // Auto-create profile if it doesn't exist yet
        if (!profile?.id) {
          try {
            const created: any = await consumerApi.create({
              userId: user?.id || "",
              fullName: user?.fullName || "Người dùng",
            });
            profile = created?.data || created;
          } catch {
            profile = null;
          }
        }

        setConsumer(profile);
        if (profile?.id) {
          setFullName(profile.fullName || "");
          setGender(profile.gender || "");
          setDateOfBirth(
            profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : "",
          );
          setAvatar(profile.avatar || "");
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, user, router]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatus("");
    try {
      const res = await uploadApi.uploadImage(file, "avatars");
      setAvatar(res.data.url);
      setStatus("✅ Đã tải ảnh đại diện");
    } catch {
      setStatus("❌ Upload ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    if (!consumer) return;
    setSaving(true);
    setStatus("");
    try {
      const res: any = await consumerApi.update(consumer.id, {
        fullName: fullName || undefined,
        avatar: avatar || undefined,
        dateOfBirth: dateOfBirth || undefined,
        gender: (gender || undefined) as any,
      });
      setConsumer(res?.data || res);
      setStatus("✅ Đã lưu hồ sơ");
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Lỗi lưu hồ sơ"));
    } finally {
      setSaving(false);
    }
  }

  async function addAddress() {
    if (!consumer || !addrText.trim()) {
      setStatus("Vui lòng nhập địa chỉ");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res: any = await consumerApi.addAddress(consumer.id, {
        label: ADDR_TYPE_META[addrType].label,
        fullAddress: addrText.trim(),
        city: "TP. Hồ Chí Minh",
        type: addrType,
        gps: location
          ? { latitude: location.latitude, longitude: location.longitude }
          : undefined,
      });
      setConsumer(res?.data || res);
      setShowAddAddress(false);
      setAddrText("");
      setStatus("✅ Đã thêm địa chỉ");
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Lỗi thêm địa chỉ"));
    } finally {
      setSaving(false);
    }
  }

  async function removeAddress(addressId: string) {
    if (!consumer) return;
    setSaving(true);
    setStatus("");
    try {
      const res: any = await consumerApi.removeAddress(consumer.id, addressId);
      setConsumer(res?.data || res);
      setStatus("✅ Đã xóa địa chỉ");
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Lỗi xóa địa chỉ"));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword) {
      setStatus("Vui lòng nhập đủ mật khẩu");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setStatus("✅ Đã đổi mật khẩu");
      setShowChangePw(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Lỗi đổi mật khẩu"));
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

  const addresses = consumer?.addresses || [];

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-2xl mx-auto pb-24">
      <header className="bg-[#1a1a2e] px-4 py-4 text-white sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">
            ←
          </Link>
          <h1 className="text-lg font-bold">👤 Hồ sơ cá nhân</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="px-4 py-5 space-y-4">
        {status && (
          <div
            className={`p-3 rounded-lg text-sm ${status.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}
          >
            {status}
          </div>
        )}

        {/* Avatar + basic info */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-4 mb-4">
            {avatar ? (
              <img
                src={avatar}
                alt="avatar"
                className="w-20 h-20 rounded-full object-cover border-2 border-[#ff6b35]"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-3xl">
                👤
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="bg-[#ff6b35] text-white text-xs px-3 py-1.5 rounded-lg"
            >
              {uploading ? "Đang tải..." : "📷 Đổi ảnh"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Họ tên
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:border-[#ff6b35] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Giới tính
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:border-[#ff6b35] outline-none"
              >
                <option value="">— Chọn —</option>
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
                <option value="OTHER">Khác</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ngày sinh
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:border-[#ff6b35] outline-none"
              />
            </div>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full bg-[#ff6b35] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {saving ? "Đang lưu..." : "💾 Lưu thay đổi"}
            </button>
          </div>
        </div>

        {/* Addresses */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[#1a1a2e]">📍 Địa chỉ đã lưu</h3>
            <button
              onClick={() => setShowAddAddress(!showAddAddress)}
              className="text-sm font-semibold text-[#ff6b35]"
            >
              {showAddAddress ? "✕ Đóng" : "+ Thêm"}
            </button>
          </div>

          {showAddAddress && (
            <div className="bg-gray-50 rounded-xl p-4 mb-3 space-y-3">
              <div className="flex gap-2">
                {(["HOME", "WORK", "OTHER"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAddrType(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${addrType === t ? "bg-[#ff6b35] text-white" : "bg-white text-gray-600 border"}`}
                  >
                    {ADDR_TYPE_META[t].icon} {ADDR_TYPE_META[t].label}
                  </button>
                ))}
              </div>
              <input
                value={addrText}
                onChange={(e) => setAddrText(e.target.value)}
                placeholder="Nhập địa chỉ (VD: 456 Lê Lợi, Q.1)"
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
              />
              {location && (
                <p className="text-xs text-gray-400">
                  📍 Vị trí hiện tại: {location.address}
                </p>
              )}
              <button
                onClick={addAddress}
                disabled={saving}
                className="w-full bg-[#ff6b35] text-white py-2 rounded-xl font-semibold text-sm"
              >
                ✅ Thêm địa chỉ
              </button>
            </div>
          )}

          {addresses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Chưa có địa chỉ nào
            </p>
          ) : (
            <div className="space-y-2">
              {addresses.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {ADDR_TYPE_META[a.type]?.icon || "📍"}{" "}
                      {a.label || a.fullAddress}
                      {a.isDefault && (
                        <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                          Mặc định
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {a.fullAddress}
                    </p>
                  </div>
                  <button
                    onClick={() => removeAddress(a.id)}
                    className="text-red-400 hover:text-red-600 text-sm ml-3"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Change password */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[#1a1a2e]">🔐 Đổi mật khẩu</h3>
            <button
              onClick={() => setShowChangePw(!showChangePw)}
              className="text-sm font-semibold text-[#ff6b35]"
            >
              {showChangePw ? "✕ Đóng" : "Đổi"}
            </button>
          </div>
          {showChangePw && (
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
                placeholder="Mật khẩu mới (8+ ký tự)"
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
              />
              <button
                onClick={changePassword}
                disabled={saving}
                className="w-full bg-[#1a1a2e] text-white py-2.5 rounded-xl font-semibold text-sm"
              >
                Đổi mật khẩu
              </button>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={() => {
            clearAuth();
            router.push("/");
          }}
          className="w-full bg-white text-red-500 py-3 rounded-2xl shadow-sm font-semibold text-sm hover:bg-red-50 transition"
        >
          🚪 Đăng xuất
        </button>
      </main>
    </div>
  );
}
