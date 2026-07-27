// ============================================================================
// MyThFood HTTP Client - Axios wrapper with JWT interceptor
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_GATEWAY || 'http://localhost:3001';

interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

class HttpClient {
  private tokenGetter: (() => string | null) | null = null;

  setTokenGetter(getter: () => string | null) {
    this.tokenGetter = getter;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.tokenGetter) {
      const token = this.tokenGetter();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  private buildUrl(servicePort: number, path: string): string {
    // In dev, each service has its own port. In prod, API gateway.
    const base = API_BASE_URL.includes('3001')
      ? `http://localhost:${servicePort}`
      : API_BASE_URL;
    return `${base}/api/v1${path}`;
  }

  async get<T>(
    servicePort: number,
    path: string,
    config?: RequestConfig,
  ): Promise<T> {
    const url = this.buildUrl(servicePort, path);
    const params = new URLSearchParams();
    if (config?.params) {
      Object.entries(config.params).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const query = params.toString();
    const res = await fetch(query ? `${url}?${query}` : url, {
      method: 'GET',
      headers: { ...this.getAuthHeaders(), ...config?.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, err.message || 'Request failed', err);
    }
    return res.json();
  }

  async post<T>(
    servicePort: number,
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<T> {
    const url = this.buildUrl(servicePort, path);
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.getAuthHeaders(), ...config?.headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, err.message || 'Request failed', err);
    }
    return res.json();
  }

  async put<T>(
    servicePort: number,
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<T> {
    const url = this.buildUrl(servicePort, path);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.getAuthHeaders(), ...config?.headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, err.message || 'Request failed', err);
    }
    return res.json();
  }

  async patch<T>(
    servicePort: number,
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<T> {
    const url = this.buildUrl(servicePort, path);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...this.getAuthHeaders(), ...config?.headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, err.message || 'Request failed', err);
    }
    return res.json();
  }

  async delete<T>(
    servicePort: number,
    path: string,
    config?: RequestConfig,
  ): Promise<T> {
    const url = this.buildUrl(servicePort, path);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { ...this.getAuthHeaders(), ...config?.headers },
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, err.message || 'Request failed', err);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const httpClient = new HttpClient();