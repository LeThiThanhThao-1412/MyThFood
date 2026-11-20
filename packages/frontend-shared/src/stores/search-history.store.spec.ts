import {
  useSearchHistoryStore,
  MAX_SEARCH_HISTORY,
} from "./search-history.store";

describe("search-history.store", () => {
  beforeEach(() => {
    useSearchHistoryStore.getState().clearHistory();
  });

  it("adds a keyword", () => {
    useSearchHistoryStore.getState().addKeyword("phở bò");
    expect(useSearchHistoryStore.getState().keywords).toEqual(["phở bò"]);
  });

  it("keeps the newest keyword first", () => {
    const { addKeyword } = useSearchHistoryStore.getState();
    addKeyword("cơm");
    addKeyword("phở");
    expect(useSearchHistoryStore.getState().keywords).toEqual(["phở", "cơm"]);
  });

  it("trims and collapses whitespace", () => {
    useSearchHistoryStore.getState().addKeyword("   phở    bò   ");
    expect(useSearchHistoryStore.getState().keywords).toEqual(["phở bò"]);
  });

  it("ignores empty / whitespace-only keywords", () => {
    const { addKeyword } = useSearchHistoryStore.getState();
    addKeyword("");
    addKeyword("    ");
    expect(useSearchHistoryStore.getState().keywords).toEqual([]);
  });

  it("de-duplicates case-insensitively and moves the match to the front", () => {
    const { addKeyword } = useSearchHistoryStore.getState();
    addKeyword("Phở");
    addKeyword("cơm");
    addKeyword("PHỞ");
    expect(useSearchHistoryStore.getState().keywords).toEqual(["PHỞ", "cơm"]);
  });

  it(`caps the history at ${MAX_SEARCH_HISTORY} entries`, () => {
    const { addKeyword } = useSearchHistoryStore.getState();
    for (let i = 1; i <= MAX_SEARCH_HISTORY + 5; i += 1) {
      addKeyword(`keyword-${i}`);
    }
    const { keywords } = useSearchHistoryStore.getState();
    expect(keywords).toHaveLength(MAX_SEARCH_HISTORY);
    expect(keywords[0]).toBe(`keyword-${MAX_SEARCH_HISTORY + 5}`);
    expect(keywords).not.toContain("keyword-1");
  });

  it("removes a keyword case-insensitively", () => {
    const { addKeyword, removeKeyword } = useSearchHistoryStore.getState();
    addKeyword("phở");
    addKeyword("cơm");
    removeKeyword("PHỞ");
    expect(useSearchHistoryStore.getState().keywords).toEqual(["cơm"]);
  });

  it("clears the whole history", () => {
    const { addKeyword, clearHistory } = useSearchHistoryStore.getState();
    addKeyword("phở");
    addKeyword("cơm");
    clearHistory();
    expect(useSearchHistoryStore.getState().keywords).toEqual([]);
  });
});
