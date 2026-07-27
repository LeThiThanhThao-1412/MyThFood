declare module '*.css';

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_API_GATEWAY?: string;
    NEXT_PUBLIC_WS_URL?: string;
  }
}
