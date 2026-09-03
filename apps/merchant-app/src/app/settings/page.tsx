"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { merchantApi, uploadApi } from "@mythfood/api-client";
import {
  useAuthStore,
  FOOD_CATEGORIES as MERCHANT_CATEGORIES,
} from "@mythfood/frontend-shared";
import TopNav from "@/components/TopNav";

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [merchant, setMerchant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // Operating hours
  const [hours, setHours] = useState<any[]>([
    {
      dayOfWeek: 0,
      openTime: "08:00",
      closeTime: "22:00",
      isClosed: false,
      label: "CN",
    },
    {
      dayOfWeek: 1,
      openTime: "08:00",
      closeTime: "22:00",
      isClosed: false,
      label: "T2",
    },
    {
      dayOfWeek: 2,
      openTime: "08:00",
      closeTime: "22:00",
      isClosed: false,
      label: "T3",
    },
    {
      dayOfWeek: 3,
      openTime: "08:00",
      closeTime: "22:00",
      isClosed: false,
      label: "T4",
    },
    {
      dayOfWeek: 4,
      openTime: "08:00",
      closeTime: "22:00",
      isClosed: false,
      label: "T5",
    },
    {
      dayOfWeek: 5,
      openTime: "08:00",
      closeTime: "22:00",
      isClosed: false,
      label: "T6",
    },
    {
      dayOfWeek: 6,
      openTime: "08:00",
      closeTime: "22:00",
      isClosed: false,
      label: "T7",
    },
  ]);

  // Capacity
  const [capacity, setCapacity] = useState({
    maxConcurrentOrders: 20,
    averagePreparationMinutes: 15,
  });

  // COD settings
  const [acceptsCod, setAcceptsCod] = useState(true);

  // Open/Closed status
  const [isOpen, setIsOpen] = useState(true);

  // Categories
  const [primaryCategory, setPrimaryCategory] = useState("pho");
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>([]);

  // Info & images
  const [info, setInfo] = useState({
    name: "",
    description: "",
    address: "",
    phone: "",
  });
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        const m = (res.items || []).find((m2: any) => m2.userId === user?.id);
        setMerchant(m);
        if (m) {
          // Load existing categories
          if (m.primaryCategory) setPrimaryCategory(m.primaryCategory);
          if (m.secondaryCategories)
            setSecondaryCategories(m.secondaryCategories);

          // Load open/closed status
          if (m.isOpen !== undefined) setIsOpen(m.isOpen);

          // Load info & images
          setInfo({
            name: m.name || "",
            description: m.description || "",
            address: m.address || "",
            phone: m.phone || "",
          });
          setLogoUrl(m.logoUrl || "");
          setCoverUrl(m.coverImageUrl || "");

          // Load COD setting from localStorage
          const codSetting = localStorage.getItem(
            `merchant_${m.id}_acceptsCod`,
          );
          if (codSetting !== null) {
            setAcceptsCod(codSetting === "true");
          }
          try {
            const h = await merchantApi.getOperatingHours(m.id);
            if (Array.isArray(h) && h.length > 0) {
              setHours(
                h.map((hh: any) => ({
                  dayOfWeek: hh.dayOfWeek,
                  openTime: (hh.openTime || "").slice(0, 5),
                  closeTime: (hh.closeTime || "").slice(0, 5),
                  isClosed: !!hh.isClosed,
                  label: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][
                    hh.dayOfWeek
                  ],
                })),
              );
            }
          } catch {}
          try {
            const c = await merchantApi.getCapacity(m.id);
            if (c)
              setCapacity({
                maxConcurrentOrders: c.maxConcurrentOrders || 20,
                averagePreparationMinutes: c.averagePreparationMinutes || 15,
              });
          } catch {}
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, user, router]);

  async function saveHours() {
    if (!merchant) return;
    setSaving(true);
    setStatus("");
    try {
      await merchantApi.setOperatingHours(merchant.id, {
        hours: hours.map((h: any) => ({
          dayOfWeek: h.dayOfWeek,
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: !!h.isClosed,
        })),
      });
      setStatus("✅ Đã lưu giờ hoạt động");
    } catch {
      setStatus("❌ Lỗi lưu giờ hoạt động");
    } finally {
      setSaving(false);
    }
  }

  async function saveCapacity() {
    if (!merchant) return;
    setSaving(true);
    setStatus("");
    try {
      await merchantApi.updateCapacity(merchant.id, {
        maxConcurrentOrders: Number(capacity.maxConcurrentOrders),
        prepTimePerOrder: Number(capacity.averagePreparationMinutes),
      });
      setStatus("✅ Đã lưu sức chứa");
    } catch {
      setStatus("❌ Lỗi lưu sức chứa");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOpenStatus() {
    if (!merchant) return;
    const newValue = !isOpen;
    setIsOpen(newValue);
    setStatus(newValue ? "✅ Đã mở cửa" : "✅ Đã tạm đóng cửa");
    try {
      const updated = await merchantApi.toggleOpen(merchant.id);
      if (updated && updated.isOpen !== undefined) setIsOpen(updated.isOpen);
    } catch {
      setIsOpen(!newValue);
      setStatus("❌ Lỗi cập nhật trạng thái hoạt động");
    }
  }

  async function saveCategories() {
    if (!merchant) return;
    setSaving(true);
    setStatus("");
    try {
      await merchantApi.update(merchant.id, {
        primaryCategory,
        secondaryCategories,
      });
      setStatus("✅ Đã lưu loại nhà hàng");
    } catch {
      setStatus("❌ Lỗi lưu loại nhà hàng");
    } finally {
      setSaving(false);
    }
  }

  function toggleSecondaryCategory(key: string) {
    setSecondaryCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !merchant) return;
    setUploading("logo");
    try {
      const res = await uploadApi.uploadImage(file, "merchants");
      setLogoUrl(res.data.url);
      await merchantApi.update(merchant.id, { logoUrl: res.data.url });
      setStatus("✅ Đã cập nhật logo");
    } catch {
      setStatus("❌ Lỗi upload logo");
    } finally {
      setUploading(null);
    }
  }

  async function uploadCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !merchant) return;
    setUploading("cover");
    try {
      const res = await uploadApi.uploadImage(file, "covers");
      setCoverUrl(res.data.url);
      await merchantApi.update(merchant.id, { coverImageUrl: res.data.url });
      setStatus("✅ Đã cập nhật ảnh bìa");
    } catch {
      setStatus("❌ Lỗi upload ảnh bìa");
    } finally {
      setUploading(null);
    }
  }

  async function saveInfo() {
    if (!merchant) return;
    setSaving(true);
    setStatus("");
    try {
      await merchantApi.update(merchant.id, {
        name: info.name,
        description: info.description,
        address: info.address,
        phone: info.phone,
      });
      setStatus("✅ Đã lưu thông tin");
    } catch {
      setStatus("❌ Lỗi lưu thông tin");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  if (!merchant) return null;

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0">
      <TopNav />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <h1 className="text-2xl font-extrabold text-[#1a1a2e] mb-4">
          ⚙️ Cài đặt nhà hàng
        </h1>
        {status && (
          <div
            className={`p-4 rounded-xl text-sm font-medium ${status.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}
          >
            {status}
          </div>
        )}

        {/* Info & Images */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">🏪 Thông tin & Hình ảnh</h3>

          {/* Cover */}
          <div className="relative h-32 rounded-xl overflow-hidden mb-4 bg-gray-100">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Ảnh bìa"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                Ảnh bìa
              </div>
            )}
            <label className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer hover:bg-black/80 transition">
              {uploading === "cover" ? "Đang tải..." : "🖼️ Đổi ảnh bìa"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={uploadCover}
              />
            </label>
          </div>

          {/* Logo */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gray-100 shrink-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">
                  🏪
                </div>
              )}
              <label className="absolute inset-0 flex items-end justify-center bg-black/40 opacity-0 hover:opacity-100 transition cursor-pointer">
                <span className="text-white text-[10px] pb-1">📷</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={uploadLogo}
                />
              </label>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 truncate">
                {info.name || "Nhà hàng"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {uploading === "logo"
                  ? "Đang tải logo..."
                  : "Bấm vào logo để đổi"}
              </p>
            </div>
          </div>

          {/* Info fields */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tên nhà hàng
              </label>
              <input
                value={info.name}
                onChange={(e) => setInfo({ ...info, name: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Số điện thoại
              </label>
              <input
                value={info.phone}
                onChange={(e) => setInfo({ ...info, phone: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Địa chỉ
              </label>
              <input
                value={info.address}
                onChange={(e) => setInfo({ ...info, address: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Mô tả
              </label>
              <textarea
                value={info.description}
                onChange={(e) =>
                  setInfo({ ...info, description: e.target.value })
                }
                rows={2}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
          </div>
          <button
            onClick={saveInfo}
            disabled={saving}
            className="mt-3 bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "💾 Lưu thông tin"}
          </button>
        </div>

        {/* Open/Close toggle */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">🚪 Trạng thái hoạt động</h3>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="font-semibold text-gray-800">
                {isOpen ? "🟢 Đang mở cửa" : "🔴 Tạm đóng cửa"}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                {isOpen
                  ? "Khách hàng có thể đặt món (nếu trong giờ hoạt động)"
                  : "Khách hàng sẽ không thể đặt món từ nhà hàng của bạn"}
              </p>
            </div>
            <button
              onClick={toggleOpenStatus}
              className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${isOpen ? "bg-green-500" : "bg-gray-300"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${isOpen ? "translate-x-7" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>

        {/* Operating Hours */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">🕐 Giờ hoạt động</h3>
          <div className="space-y-2">
            {hours.map((h, i) => (
              <div
                key={h.dayOfWeek}
                className="flex items-center gap-3 py-2 flex-wrap"
              >
                <span className="w-10 text-sm font-semibold text-gray-600">
                  {h.label}
                </span>
                <input
                  type="time"
                  value={h.openTime}
                  disabled={!!h.isClosed}
                  onChange={(e) => {
                    const nh = [...hours];
                    nh[i] = { ...nh[i], openTime: e.target.value };
                    setHours(nh);
                  }}
                  className="border rounded-lg px-3 py-2 text-sm w-32 disabled:opacity-40 disabled:bg-gray-50"
                />
                <span className="text-gray-400">đến</span>
                <input
                  type="time"
                  value={h.closeTime}
                  disabled={!!h.isClosed}
                  onChange={(e) => {
                    const nh = [...hours];
                    nh[i] = { ...nh[i], closeTime: e.target.value };
                    setHours(nh);
                  }}
                  className="border rounded-lg px-3 py-2 text-sm w-32 disabled:opacity-40 disabled:bg-gray-50"
                />
                <label className="ml-2 flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!h.isClosed}
                    onChange={(e) => {
                      const nh = [...hours];
                      nh[i] = { ...nh[i], isClosed: e.target.checked };
                      setHours(nh);
                    }}
                    className="w-4 h-4 accent-[#ff6b35]"
                  />
                  <span
                    className={h.isClosed ? "text-red-500 font-semibold" : ""}
                  >
                    Nghỉ ngày này
                  </span>
                </label>
              </div>
            ))}
          </div>
          <button
            onClick={saveHours}
            disabled={saving}
            className="mt-4 bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu giờ hoạt động"}
          </button>
        </div>

        {/* Capacity */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">📊 Sức chứa & Chuẩn bị</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số đơn tối đa cùng lúc
              </label>
              <input
                type="number"
                value={capacity.maxConcurrentOrders}
                onChange={(e) =>
                  setCapacity({
                    ...capacity,
                    maxConcurrentOrders: Number(e.target.value),
                  })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Thời gian chuẩn bị TB (phút)
              </label>
              <input
                type="number"
                value={capacity.averagePreparationMinutes}
                onChange={(e) =>
                  setCapacity({
                    ...capacity,
                    averagePreparationMinutes: Number(e.target.value),
                  })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
                min={5}
              />
            </div>
          </div>
          <button
            onClick={saveCapacity}
            disabled={saving}
            className="mt-4 bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu sức chứa"}
          </button>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">🍽️ Loại nhà hàng</h3>
          <p className="text-sm text-gray-500 mb-3">
            Chọn loại chính để khách hàng dễ tìm thấy bạn
          </p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {MERCHANT_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setPrimaryCategory(cat.key)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-medium transition ${
                  primaryCategory === cat.key
                    ? "border-[#ff6b35] bg-orange-50 text-[#ff6b35]"
                    : "border-gray-200 bg-white text-gray-600 hover:border-orange-200"
                }`}
              >
                <span className="text-xl">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Loại phụ (tùy chọn)
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {MERCHANT_CATEGORIES.filter((c) => c.key !== primaryCategory).map(
              (cat) => {
                const active = secondaryCategories.includes(cat.key);
                return (
                  <button
                    key={cat.key}
                    onClick={() => toggleSecondaryCategory(cat.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      active
                        ? "bg-[#ff6b35] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {cat.icon} {cat.label}
                  </button>
                );
              },
            )}
          </div>
          <button
            onClick={saveCategories}
            disabled={saving}
            className="bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu loại nhà hàng"}
          </button>
        </div>

        {/* COD Settings */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">💵 Cài đặt thanh toán COD</h3>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="font-semibold text-gray-800">Nhận đơn COD</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {acceptsCod
                  ? "Khách hàng có thể chọn thanh toán khi nhận hàng"
                  : "Chỉ chấp nhận thanh toán qua thẻ"}
              </p>
            </div>
            <button
              onClick={() => {
                const newValue = !acceptsCod;
                setAcceptsCod(newValue);
                if (merchant) {
                  localStorage.setItem(
                    `merchant_${merchant.id}_acceptsCod`,
                    String(newValue),
                  );
                }
                setStatus(`✅ Đã ${newValue ? "bật" : "tắt"} nhận đơn COD`);
              }}
              className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
                acceptsCod ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${
                  acceptsCod ? "translate-x-7" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <p className="font-semibold mb-1">ℹ️ Lưu ý về COD:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Tài xế cần số dư ví ≥ 2.000.000₫ để nhận đơn COD</li>
              <li>
                Tiền món sẽ được giữ trong ví tài xế đến khi giao thành công
              </li>
              <li>Nếu tắt COD, khách chỉ có thể thanh toán qua thẻ</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
