"use client";
import { useSearchHistoryStore } from "@mythfood/frontend-shared";

interface SearchHistoryDropdownProps {
  /** Only shown when the search input is focused and empty. */
  visible: boolean;
  onPick: (keyword: string) => void;
  onClose: () => void;
}

/**
 * Recent-search dropdown (feature: lịch sử tìm kiếm).
 * Keywords are persisted in localStorage by `useSearchHistoryStore`.
 */
export default function SearchHistoryDropdown({
  visible,
  onPick,
  onClose,
}: SearchHistoryDropdownProps) {
  const { keywords, removeKeyword, clearHistory } = useSearchHistoryStore();

  if (!visible || keywords.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 z-[60] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          🕘 Tìm kiếm gần đây
        </span>
        <button
          type="button"
          // onMouseDown so it fires before the input's onBlur hides the dropdown
          onMouseDown={(e) => {
            e.preventDefault();
            clearHistory();
            onClose();
          }}
          className="text-xs text-gray-400 hover:text-red-500 transition"
        >
          Xoá tất cả
        </button>
      </div>
      <ul className="max-h-72 overflow-y-auto">
        {keywords.map((keyword) => (
          <li
            key={keyword}
            className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-orange-50 transition group"
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(keyword);
              }}
              className="flex items-center gap-2.5 flex-1 text-left text-sm text-gray-700 min-w-0"
            >
              <span className="text-gray-300 shrink-0">🔍</span>
              <span className="truncate">{keyword}</span>
            </button>
            <button
              type="button"
              aria-label={`Xoá "${keyword}" khỏi lịch sử`}
              onMouseDown={(e) => {
                e.preventDefault();
                removeKeyword(keyword);
              }}
              className="text-gray-300 hover:text-red-500 text-xs shrink-0 px-1 transition"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
