declare module "*.css";

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_API_GATEWAY?: string;
    NEXT_PUBLIC_WS_URL?: string;
    /** Khoá MapTiler (vector tile style). Dùng cho MapView / MapLibre GL. */
    NEXT_PUBLIC_MAPTILER_KEY?: string;
    /** Ghi đè toàn bộ URL style.json nếu muốn dùng nguồn khác MapTiler. */
    NEXT_PUBLIC_MAP_STYLE_URL?: string;
  }
}
