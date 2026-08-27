"use client";

import { useRouter } from "next/navigation";
import { Drawer, useCartStore } from "@mythfood/frontend-shared";

export default function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { items, removeItem, updateQuantity, getSubtotal, merchantName } =
    useCartStore();
  const subtotal = getSubtotal();
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Drawer open={open} onClose={onClose} title={`🛒 Giỏ hàng (${count})`}>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {merchantName && (
            <p className="text-xs text-gray-400 mb-3">🏪 {merchantName}</p>
          )}
          {items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-5xl mb-3">🛒</p>
              <p className="text-gray-400">Giỏ hàng trống</p>
              <button
                onClick={onClose}
                className="mt-4 text-sm font-semibold text-[#ff6b35] hover:underline"
              >
                Khám phá nhà hàng
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.variantKey} className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-[#fff7ed] flex items-center justify-center text-2xl shrink-0">
                    🍽️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">
                      {item.menuItem.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {(
                        item.unitPrice ??
                        item.menuItem.price ??
                        0
                      ).toLocaleString("vi-VN")}
                      ₫
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        updateQuantity(item.variantKey, item.quantity - 1)
                      }
                      className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateQuantity(item.variantKey, item.quantity + 1)
                      }
                      className="w-7 h-7 rounded-full bg-[#ff6b35] text-white flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-20 text-right shrink-0">
                    <p className="font-bold text-[#ff6b35] text-sm">
                      {((item.unitPrice ?? 0) * item.quantity).toLocaleString(
                        "vi-VN",
                      )}
                      ₫
                    </p>
                    <button
                      onClick={() => removeItem(item.variantKey)}
                      className="text-[10px] text-gray-400 hover:text-red-500"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4 shrink-0 bg-white">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-800">Tổng cộng</span>
              <span className="font-bold text-[#ff6b35] text-lg">
                {subtotal.toLocaleString("vi-VN")}₫
              </span>
            </div>
            <button
              onClick={() => {
                onClose();
                router.push("/checkout");
              }}
              className="block w-full text-center bg-[#ff6b35] text-white py-3 rounded-xl font-semibold hover:bg-orange-600 transition"
            >
              Thanh toán →
            </button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
