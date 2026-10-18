"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  dispatchApi,
  orderApi,
  shippingApi,
  type DeliveryOption,
  type DeliveryOptionConfig,
  type DeliveryOptionStatsRow,
  type StackingStats,
} from "@mythfood/api-client";
import {
  useAuthStore,
  deliveryOptionMeta,
  DELIVERY_OPTION_LIST,
} from "@mythfood/frontend-shared";
import AdminShell from "../../components/AdminShell";

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function DeliveryOptionsAdminPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const [configs, setConfigs] = useState<DeliveryOptionConfig[]>([]);
  const [stats, setStats] = useState<DeliveryOptionStatsRow[]>([]);
  const [stacking, setStacking] = useState<StackingStats | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [configRes, statsRes, stackingRes] = await Promise.all([
        shippingApi.getOptionConfigs(),
        orderApi.getDeliveryOptionStats(days),
        dispatchApi.getStackingStats(days),
      ]);
      setConfigs((configRes as any)?.data ?? (configRes as any) ?? []);
      setStats((statsRes as any)?.data ?? []);
      setStacking((stackingRes as any)?.data ?? null);
    } catch (e: any) {
      setError(e?.message || "Không tải được cấu hình giao hàng");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const updateField = (
    option: DeliveryOption,
    field: keyof DeliveryOptionConfig,
    value: number,
  ) => {
    setConfigs((prev) =>
      prev.map((c) => (c.option === option ? { ...c, [field]: value } : c)),
    );
  };

  const save = async (config: DeliveryOptionConfig) => {
    setSaving(config.option);
    setMessage("");
    setError("");
    try {
      await shippingApi.updateOptionConfig(config.option, {
        feeFactor: toNum(config.feeFactor),
        fixedSurcharge: toNum(config.fixedSurcharge),
        minFee: toNum(config.minFee),
        maxFee: toNum(config.maxFee),
        prepMinutes: toNum(config.prepMinutes),
        etaBufferMinutes: toNum(config.etaBufferMinutes),
        dispatchTimeoutSeconds: toNum(config.dispatchTimeoutSeconds),
        driverResponseTimeoutSeconds: toNum(
          config.driverResponseTimeoutSeconds,
        ),
        maxStackedOrders: toNum(config.maxStackedOrders),
      });
      setMessage(`Đã lưu cấu hình ${deliveryOptionMeta(config.option).label}`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Lưu cấu hình thất bại");
    } finally {
      setSaving(null);
    }
  };

  const numberField = (
    config: DeliveryOptionConfig,
    field: keyof DeliveryOptionConfig,
    label: string,
    step = 1,
  ) => (
    <label className="block">
      <span className="text-[11px] text-gray-500">{label}</span>
      <input
        type="number"
        step={step}
        value={String(config[field] ?? 0)}
        onChange={(e) =>
          updateField(config.option, field, Number(e.target.value))
        }
        className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#ff6b35] outline-none"
      />
    </label>
  );

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1a1a2e]">
            🚚 Phương thức giao hàng
          </h1>
          <p className="text-sm text-gray-500">
            Cấu hình phí, ETA, timeout điều phối và số đơn gộp SAVER.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
          </select>
          <button
            onClick={load}
            className="rounded-xl bg-[#1a1a2e] text-white px-3 py-2 text-sm font-semibold"
          >
            🔄 Tải lại
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm mb-3">
          ⚠️ {error}
        </div>
      )}
      {message && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-4 py-3 text-sm mb-3">
          ✅ {message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {DELIVERY_OPTION_LIST.map((meta) => {
              const config = configs.find((c) => c.option === meta.option);
              if (!config) return null;
              return (
                <div
                  key={meta.option}
                  className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-[#1a1a2e]">
                      {meta.icon} {meta.label}
                    </h2>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`}
                    >
                      {meta.option}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {numberField(config, "feeFactor", "Hệ số giá", 0.05)}
                    {numberField(config, "fixedSurcharge", "Phụ thu cố định")}
                    {numberField(config, "minFee", "Phí tối thiểu")}
                    {numberField(config, "maxFee", "Phí tối đa")}
                    {numberField(config, "prepMinutes", "Chuẩn bị (phút)")}
                    {numberField(
                      config,
                      "etaBufferMinutes",
                      "Buffer ETA (phút)",
                    )}
                    {numberField(
                      config,
                      "dispatchTimeoutSeconds",
                      "Timeout điều phối (giây)",
                    )}
                    {numberField(
                      config,
                      "driverResponseTimeoutSeconds",
                      "Timeout phản hồi (giây)",
                    )}
                    {numberField(
                      config,
                      "maxStackedOrders",
                      "Số đơn gộp tối đa",
                    )}
                  </div>
                  <button
                    onClick={() => save(config)}
                    disabled={saving === config.option}
                    className="mt-3 w-full rounded-xl bg-[#ff6b35] text-white py-2 text-sm font-bold disabled:opacity-50"
                  >
                    {saving === config.option ? "Đang lưu..." : "Lưu cấu hình"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: "Lô gộp SAVER",
                value: stacking?.batches ?? 0,
                color: "text-emerald-600",
              },
              {
                label: "Dispatch trong lô",
                value: stacking?.stackedDispatches ?? 0,
                color: "text-blue-600",
              },
              {
                label: "Tổng dispatch",
                value: stacking?.totalDispatches ?? 0,
                color: "text-[#1a1a2e]",
              },
              {
                label: "Thứ tự TB trong lô",
                value: (stacking?.avgRouteSequence ?? 0).toFixed(1),
                color: "text-[#ff6b35]",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-white rounded-2xl shadow-sm p-4 text-center"
              >
                <p className="text-xs text-gray-400">{card.label}</p>
                <p className={`text-xl font-extrabold mt-1 ${card.color}`}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-white rounded-2xl shadow-sm p-4 overflow-x-auto">
            <h2 className="font-bold text-[#1a1a2e] mb-3">
              📊 Hiệu quả theo phương thức ({days} ngày)
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2">Phương thức</th>
                  <th className="py-2 text-right">Tổng đơn</th>
                  <th className="py-2 text-right">Đã giao</th>
                  <th className="py-2 text-right">Trễ SLA</th>
                  <th className="py-2 text-right">Phí ship TB</th>
                  <th className="py-2 text-right">Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => {
                  const meta = deliveryOptionMeta(row.deliveryOption);
                  const lateRate =
                    row.delivered > 0
                      ? Math.round((row.late / row.delivered) * 100)
                      : 0;
                  return (
                    <tr
                      key={row.deliveryOption}
                      className="border-b border-gray-50 last:border-0"
                    >
                      <td className="py-2.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`}
                        >
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold">
                        {row.total}
                      </td>
                      <td className="py-2.5 text-right">{row.delivered}</td>
                      <td
                        className={`py-2.5 text-right font-semibold ${
                          lateRate > 20 ? "text-red-600" : "text-gray-600"
                        }`}
                      >
                        {row.late} ({lateRate}%)
                      </td>
                      <td className="py-2.5 text-right">
                        {Math.round(row.avgFee).toLocaleString("vi-VN")}₫
                      </td>
                      <td className="py-2.5 text-right text-[#ff6b35] font-semibold">
                        {Math.round(row.revenue).toLocaleString("vi-VN")}₫
                      </td>
                    </tr>
                  );
                })}
                {stats.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-gray-400 text-sm"
                    >
                      Chưa có dữ liệu trong khoảng thời gian này
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-400 mt-3">
              “Trễ SLA” = đơn DELIVERED có thời điểm giao muộn hơn
              promisedDeliveryAt.
            </p>
          </div>
        </>
      )}
    </AdminShell>
  );
}
