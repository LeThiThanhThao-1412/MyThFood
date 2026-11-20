import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Maximum number of keywords kept in the history. */
export const MAX_SEARCH_HISTORY = 4;

interface SearchHistoryState {
  keywords: string[];
  addKeyword: (keyword: string) => void;
  removeKeyword: (keyword: string) => void;
  clearHistory: () => void;
}

/**
 * Recent search keywords, persisted to localStorage.
 * Newest first, trimmed, case-insensitively de-duplicated, capped at
 * MAX_SEARCH_HISTORY entries.
 */
export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set) => ({
      keywords: [],

      addKeyword: (keyword) =>
        set((state) => {
          const cleaned = keyword.trim().replace(/\s+/g, " ");
          if (cleaned.length === 0) {
            return state;
          }
          const lower = cleaned.toLowerCase();
          const rest = state.keywords.filter((k) => k.toLowerCase() !== lower);
          return { keywords: [cleaned, ...rest].slice(0, MAX_SEARCH_HISTORY) };
        }),

      removeKeyword: (keyword) =>
        set((state) => {
          const lower = keyword.trim().toLowerCase();
          return {
            keywords: state.keywords.filter((k) => k.toLowerCase() !== lower),
          };
        }),

      clearHistory: () => set({ keywords: [] }),
    }),
    { name: "mythfood-search-history" },
  ),
);
