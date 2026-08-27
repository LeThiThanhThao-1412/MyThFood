// ============================================================================
// MyThFood HTTP Client - Fetch wrapper with JWT + Refresh Token interceptors
// ============================================================================

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_GATEWAY || "http://localhost:3001";

interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

class HttpClient {
  private tokenGetter: (() => string | null) | null = null;
  private refreshTokenGetter: (() => string | null) | null = null;
  private onTokenRefreshed:
    | ((tokens: {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }) => void)
    | null = null;
  private onAuthFailure: (() => void) | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  setTokenGetter(getter: () => string | null) {
    this.tokenGetter = getter;
  }

  setRefreshTokenGetter(getter: () => string | null) {
    this.refreshTokenGetter = getter;
  }

  setOnTokenRefreshed(
    handler: (tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }) => void,
  ) {
    this.onTokenRefreshed = handler;
  }

  setOnAuthFailure(handler: () => void) {
    this.onAuthFailure = handler;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.tokenGetter) {
      const token = this.tokenGetter();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  private buildUrl(servicePort: number, path: string): string {
    const isLocal = API_BASE_URL.startsWith("http://localhost");
    const base = isLocal ? `http://localhost:${servicePort}` : API_BASE_URL;
    return `${base}/api/v1${path}`;
  }

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Returns true if refresh succeeded, false otherwise.
   */
  private async tryRefreshToken(): Promise<boolean> {
    if (!this.refreshTokenGetter) return false;

    const refreshToken = this.refreshTokenGetter();
    if (!refreshToken) return false;

    // If already refreshing, wait for the existing refresh attempt
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const url = `${API_BASE_URL.includes("3001") ? "http://localhost:3001" : API_BASE_URL}/api/v1/auth/refresh`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          return false;
        }

        const data: any = await res.json();
        const tokens = data.data;
        if (tokens && tokens.accessToken) {
          // Store new tokens
          if (this.onTokenRefreshed) {
            this.onTokenRefreshed({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresIn: tokens.expiresIn,
            });
          }
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async handleResponse<T>(
    res: Response,
    attemptedRefresh: boolean,
  ): Promise<T> {
    // If 401 and haven't tried refreshing yet, try refresh and retry once
    if (res.status === 401 && !attemptedRefresh) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        // Re-throw a special marker so the caller can retry
        throw new TokenRefreshedError();
      }
      // Refresh failed - trigger logout
      if (this.onAuthFailure) {
        this.onAuthFailure();
      }
    }

    if (!res.ok) {
      const err: any = await res
        .json()
        .catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, err.message || "Request failed", err);
    }

    // 204 No Content - no body to parse
    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return res.json() as Promise<T>;
  }

  async get<T>(
    servicePort: number,
    path: string,
    config?: RequestConfig,
  ): Promise<T> {
    return this.requestWithRetry(servicePort, path, "GET", undefined, config);
  }

  async post<T>(
    servicePort: number,
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<T> {
    return this.requestWithRetry(servicePort, path, "POST", body, config);
  }

  async put<T>(
    servicePort: number,
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<T> {
    return this.requestWithRetry(servicePort, path, "PUT", body, config);
  }

  async patch<T>(
    servicePort: number,
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<T> {
    return this.requestWithRetry(servicePort, path, "PATCH", body, config);
  }

  async delete<T>(
    servicePort: number,
    path: string,
    config?: RequestConfig,
  ): Promise<T> {
    return this.requestWithRetry(
      servicePort,
      path,
      "DELETE",
      undefined,
      config,
    );
  }

  private async requestWithRetry<T>(
    servicePort: number,
    path: string,
    method: string,
    body?: unknown,
    config?: RequestConfig,
    attempt = 0,
  ): Promise<T> {
    const url = this.buildUrl(servicePort, path);
    const params = new URLSearchParams();
    if (config?.params) {
      Object.entries(config.params).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const query = params.toString();

    const isFormData = body instanceof FormData;
    const authHeaders = this.getAuthHeaders();
    // Don't set Content-Type for FormData - browser sets it with boundary
    if (isFormData) {
      delete authHeaders["Content-Type"];
    }

    try {
      const res = await fetch(query ? `${url}?${query}` : url, {
        method,
        headers: { ...authHeaders, ...config?.headers },
        body: isFormData ? body : body ? JSON.stringify(body) : undefined,
      });

      return await this.handleResponse<T>(res, attempt > 0);
    } catch (err) {
      if (err instanceof TokenRefreshedError && attempt === 0) {
        // Token was refreshed, retry the request once
        return this.requestWithRetry(
          servicePort,
          path,
          method,
          body,
          config,
          1,
        );
      }
      // Re-throw ApiError or other errors
      if (err instanceof ApiError || err instanceof TokenRefreshedError) {
        throw err instanceof TokenRefreshedError
          ? new ApiError(401, "Authentication failed", undefined)
          : err;
      }
      throw new ApiError(
        0,
        err instanceof Error ? err.message : "Network error",
        err,
      );
    }
  }
}

/** Internal marker to signal that token was refreshed and request should be retried */
class TokenRefreshedError extends Error {
  constructor() {
    super("Token refreshed");
    this.name = "TokenRefreshedError";
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const httpClient = new HttpClient();
