"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { merchantApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import { formatDateTime, formatVnd, toNum } from "../../../lib/format";
import AdminShell from "../../../components/AdminShell";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  ACTIVE: { label: "Hoạt động", cls: "bg-green-100 text-green-700" },
  REJECTED: { label: "Từ chối", cls: "bg-red-100 text-red-700" },
  SUSPENDED: { label: "Bị khóa", cls: "bg-gray-100 text-gray-600" },
  CLOSED: { label: "Đóng cửa", cls: "bg-gray-100 text-gray-500" },
};

export default function AdminMerchantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { isAuthenticated } = useAuthStore();

  const [merchant, setMerchant] = useState<any>(null);
  const [menu, setMenu] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!id) return;
    load();
  }, [isAuthenticated, id]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [mRes, menuRes, statsRes] = await Promise.all([
        merchantApi.getById(id),
        merchantApi.getMenu(id, true).catch(() => []),
        merchantApi.getStats(id).catch(() => null),
      ]);
      setMerchant(mRes);
      setMenu(Array.isArray(menuRes) ? menuRes : []);
      if (statsRes) setStats(statsRes);
    } catch {
      setError("Không thể tải thông tin nhà hàng");
    } finally {
      setLoading(false);
    }
  }

  async function act(fn: () => Promise<any>, ok: string) {
    setMsg("");
    try {
      await fn();
      setMsg("✅ " + ok);
      load();
    } catch (e: any) {
      setMsg("❌ " + (e?.message || "Thao tác thất bại"));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] p-8 text-center text-gray-400">
        {error || "Không tìm thấy nhà hàng"}
      </div>
    );
  }

  const badge = STATUS_BADGE[merchant.status] || {
    label: merchant.status,
    cls: "bg-gray-100 text-gray-600",
  };

  return (
    <AdminShell title="🏪 Chi tiết nhà hàng">
      <div className="space-y-4">
        {msg && <div className="bg-white rounded-xl p-3 text-sm">{msg}</div>}

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {merchant.name}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {merchant.description || "—"}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-5 text-sm">
            <Info label="Email" value={merchant.email} />
            <Info label="SĐT" value={merchant.phone} />
            <Info label="Địa chỉ" value={merchant.address} />
            <Info
              label="Danh mục"
              value={
                [
                  merchant.primaryCategory,
                  ...(merchant.secondaryCategories || []),
                ]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            <Info
              label="Đánh giá"
              value={`${merchant.rating ?? 0} ⭐ (${merchant.totalRatings ?? 0})`}
            />
            <Info label="Tổng đơn" value={merchant.totalOrders} />
            <Info
              label="Đang mở cửa"
              value={merchant.isOpenNow ? "✅ Có" : "❌ Không"}
            />
            <Info
              label="Ngày đăng ký"
              value={formatDateTime(merchant.createdAt)}
            />
          </div>

          <div className="flex gap-2 mt-6 flex-wrap">
            {(merchant.status === "PENDING" ||
              merchant.status === "INACTIVE") && (
              <>
                <button
                  onClick={() =>
                    act(() => merchantApi.approve(id), "Đã phê duyệt nhà hàng")
                  }
                  className="bg-[#2ecc71] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-600"
                >
                  ✅ Phê duyệt
                </button>
                <button
                  onClick={() =>
                    act(() => merchantApi.reject(id), "Đã từ chối nhà hàng")
                  }
                  className="bg-[#e74c3c] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600"
                >
                  ❌ Từ chối
                </button>
              </>
            )}
          </div>
        </div>

        {stats && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-lg mb-3">📈 Thống kê</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="Tổng đơn"
                value={stats.totalOrders ?? stats.completedOrders ?? "—"}
              />
              <Stat label="Doanh thu" value={formatVnd(stats.totalRevenue)} />
              <Stat label="Đánh giá TB" value={stats.averageRating ?? "—"} />
              <Stat label="Đang xử lý" value={stats.pendingOrders ?? "—"} />
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-lg mb-3">📋 Menu ({menu.length})</h3>
          {menu.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Chưa có món nào
            </p>
          ) : (
            <div className="space-y-2">
              {menu.map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between border-b border-gray-50 py-2"
                >
                  <div className="flex items-center gap-3">
                    {m.imageUrl ? (
                      <img
                        src={m.imageUrl}
                        alt={m.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                        🍽️
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-800">{m.name}</p>
                      <p className="text-xs text-gray-400">
                        {m.category || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800">
                      {formatVnd(toNum(m.price))}
                    </p>
                    <span
                      className={`text-xs ${m.isAvailable ? "text-green-600" : "text-gray-400"}`}
                    >
                      {m.isAvailable ? "Còn bán" : "Hết món"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  );
}
