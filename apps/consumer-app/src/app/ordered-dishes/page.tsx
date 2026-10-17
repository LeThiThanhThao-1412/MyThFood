"use client";
import ConsumerShell from "@/components/ConsumerShell";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { merchantApi, orderApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import { resolveConsumerId } from "@/lib/consumer";
import { reorderOrder } from "@/lib/reorder";

export default function OrderedDishesPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [merchantNameById, setMerchantNameById] = useState<Map<string, string>>(
    new Map(),
  );
  const [dishImageMap, setDishImageMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [reorderMsg, setReorderMsg] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    (async () => {
      try {
        // Tên quán theo merchantId (để hiển thị trên từng thẻ món).
        try {
          const mRes: any = await merchantApi.list({ take: 200 });
          const mList = mRes?.items ?? [];
          const map = new Map<string, string>();
          for (const m of mList) {
            if (m?.id && m?.name) map.set(m.id, m.name);
          }
          setMerchantNameById(map);
        } catch {
          /* ignore */
        }

        if (user) {
          const cid = await resolveConsumerId(user.id, user.fullName);
          // Query theo cả consumerId lẫn userId để bắt cả đơn cũ lẫn đơn mới.
          const idsToQuery = Array.from(
            new Set([cid, user.id].filter((x): x is string => !!x)),
          );
          const allOrders: any[] = [];
          for (const id of idsToQuery) {
            try {
              const oRes = await orderApi.listByConsumer(id);
              if (Array.isArray(oRes)) allOrders.push(...oRes);
            } catch {
              /* ignore */
            }
          }
          const seen = new Set<string>();
          setOrders(
            allOrders.filter((o) => {
              if (!o?.id || seen.has(o.id)) return false;
              seen.add(o.id);
              return true;
            }),
          );
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, user, router]);

  // Gộp các món từ các đơn đặt lại được thành danh sách món riêng lẻ (loại trùng).
  const orderedDishes = useMemo(() => {
    const reorderable = orders
      .filter((o) => (o.items?.length ?? 0) > 0)
      .filter(
        (o) =>
          ![
            "CANCELLED",
            "CANCELLED_NO_DRIVER",
            "REJECTED",
            "DELIVERY_FAILED",
          ].includes(o.status),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );

    const seen = new Set<string>();
    const out: any[] = [];
    for (const o of reorderable) {
      for (const item of o.items ?? []) {
        const key = item.menuItemId || item.name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, merchantId: o.merchantId, ...item });
      }
    }
    return out;
  }, [orders]);

  // Ảnh món: ưu tiên snapshot đã lưu trong order; nếu đơn cũ chưa có thì nạp từ menu.
  useEffect(() => {
    let cancelled = false;
    const byMerchant = new Map<string, Set<string>>();
    for (const d of orderedDishes) {
      if (d.imageUrl || !d.menuItemId) continue;
      const ids = byMerchant.get(d.merchantId) ?? new Set<string>();
      ids.add(d.menuItemId);
      byMerchant.set(d.merchantId, ids);
    }
    if (byMerchant.size === 0) return;

    (async () => {
      const resolved: Record<string, string> = {};
      await Promise.all(
        [...byMerchant.entries()].map(async ([merchantId, ids]) => {
          try {
            const menu: any = await merchantApi.getMenu(merchantId, true);
            const items = Array.isArray(menu) ? menu : [];
            for (const mi of items) {
              if (ids.has(mi.id) && mi.imageUrl) resolved[mi.id] = mi.imageUrl;
            }
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) setDishImageMap((prev) => ({ ...prev, ...resolved }));
    })();

    return () => {
      cancelled = true;
    };
  }, [orderedDishes]);

  async function handleReorderDish(d: any) {
    setReorderingId(d.key);
    setReorderMsg("");
    try {
      const result = await reorderOrder({
        merchantId: d.merchantId,
        items: [d],
      });
      if (result.ok) {
        setReorderMsg(
          result.skipped > 0
            ? `✅ Đã thêm ${result.added} món (bỏ qua ${result.skipped} món hết bán)`
            : `✅ Đã thêm ${result.added} món vào giỏ`,
        );
        router.push("/cart");
      } else {
        setReorderMsg(result.error || "Không có món nào còn bán để đặt lại");
      }
    } finally {
      setReorderingId(null);
    }
  }

  return (
    <ConsumerShell title="🔄 Món đã đặt" backHref="/dashboard">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-sm p-3 animate-pulse"
              >
                <div className="h-28 bg-gray-200 rounded-xl mb-3" />
                <div className="h-3 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : orderedDishes.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
            <p className="text-5xl mb-3">🍽️</p>
            <p className="text-gray-400 text-base font-medium">
              Chưa có món nào đã đặt
            </p>
            <Link
              href="/restaurants"
              className="mt-4 inline-block bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
            >
              Đặt món ngay →
            </Link>
          </div>
        ) : (
          <>
            {reorderMsg && (
              <p
                className={`text-sm font-medium text-center bg-white rounded-xl px-3 py-2 shadow-sm mb-3 ${
                  reorderMsg.startsWith("✅")
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {reorderMsg}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {orderedDishes.map((d) => (
                <div
                  key={d.key}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col"
                >
                  <div className="h-28 bg-[#fff7ed] flex items-center justify-center overflow-hidden">
                    {d.imageUrl || dishImageMap[d.menuItemId] ? (
                      <img
                        src={d.imageUrl || dishImageMap[d.menuItemId]}
                        alt={d.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl">🍽️</span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2">
                      {d.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {merchantNameById.get(d.merchantId) || "Nhà hàng"}
                    </p>
                    <button
                      type="button"
                      disabled={reorderingId === d.key}
                      onClick={() => handleReorderDish(d)}
                      className="mt-auto pt-2 w-full text-xs font-semibold text-[#ff6b35] bg-orange-50 hover:bg-orange-100 px-3 py-2 rounded-lg transition disabled:opacity-50"
                    >
                      {reorderingId === d.key ? "Đang thêm..." : "🔄 Đặt lại"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
    </ConsumerShell>
  );
}
