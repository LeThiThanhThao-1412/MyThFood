declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_MAPTILER_KEY?: string;
    NEXT_PUBLIC_MAP_STYLE_URL?: string;
  }
}
