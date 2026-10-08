"use client";

import Link from "next/link";

function badge(it: any) {
  if (it.discountType === "PERCENT") {
    return `-${Math.round(Number(it.discountPercent) || 0)}%`;
  }
  const d = Number(it.originalPrice) - Number(it.salePrice);
  if (d >= 1000) return `-${Math.round(d / 1000)}k`;
  return `-${d.toLocaleString("vi-VN")}đ`;
}

export default function FlashSaleDrawer({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: any[];
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <style>{`@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="relative w-full max-w-2xl max-h-[82vh] bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: "sheetUp 0.28s ease-out" }}
      >
        {/* Tay cầm kéo */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-lg text-[#1a1a2e]">
            🔥 Flash Sale ({items.length})
          </h3>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-lg transition"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-2">🔥</p>
              <p className="text-gray-400 text-sm">Chưa có flash sale nào</p>
            </div>
          ) : (
            items.map((it: any) => {
              const remaining = Math.max(
                0,
                (it.totalQuantity ?? 0) - (it.soldQuantity ?? 0),
              );
              const pct =
                it.totalQuantity > 0
                  ? Math.min(
                      100,
                      Math.round(
                        ((it.soldQuantity ?? 0) / it.totalQuantity) * 100,
                      ),
                    )
                  : 0;
              return (
                <Link
                  key={it.id}
                  href={`/restaurants/${it.merchantId}`}
                  onClick={onClose}
                  className="flex gap-3 border border-gray-100 rounded-xl p-3 hover:border-[#ff6b35] hover:bg-gray-50 transition no-underline"
                >
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-[#fff7ed] shrink-0 flex items-center justify-center">
                    {it.imageUrl ? (
                      <img
                        src={it.imageUrl}
                        alt={it.menuItemName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl">🍽️</span>
                    )}
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {badge(it)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2">
                      {it.menuItemName || "Món flash sale"}
                    </p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-[#ff6b35] font-bold">
                        {Number(it.salePrice).toLocaleString("vi-VN")}đ
                      </span>
                      <span className="text-xs text-gray-400 line-through">
                        {Number(it.originalPrice).toLocaleString("vi-VN")}đ
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#ff6b35] rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Còn {remaining} suất · Đã bán {it.soldQuantity ?? 0}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
