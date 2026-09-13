"use client";
import type { MenuSearchItem } from "@mythfood/api-client";

interface SearchSuggestionsDropdownProps {
  /** Hiển thị khi input đang focus và có ký tự đang gõ. */
  visible: boolean;
  suggestions: MenuSearchItem[];
  onPick: (item: MenuSearchItem) => void;
}

/**
 * Dropdown gợi ý món ăn (feature: tìm kiếm theo món).
 * Dùng `onMouseDown` để chạy trước `onBlur` của input (giữ dropdown mở khi bấm).
 */
export default function SearchSuggestionsDropdown({
  visible,
  suggestions,
  onPick,
}: SearchSuggestionsDropdownProps) {
  if (!visible || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 z-[60] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-50">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          🍲 Gợi ý món ăn
        </span>
      </div>
      <ul className="max-h-80 overflow-y-auto">
        {suggestions.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(item);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50 transition text-left"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-10 h-10 rounded-lg object-cover bg-gray-50 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-lg shrink-0">
                  🍽️
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {item.name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {item.merchant?.name}
                </p>
              </div>
              <span className="text-sm font-bold text-[#ff6b35] shrink-0">
                {item.price.toLocaleString("vi-VN")}đ
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
