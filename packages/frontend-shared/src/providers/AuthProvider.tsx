"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/auth.store";
import { httpClient } from "@mythfood/api-client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_GATEWAY || "http://localhost:3001";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    token,
    refreshToken,
    user,
    isAuthenticated,
    setAuth,
    setTokens,
    clearAuth,
  } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  // ── Step 1: Wait for Zustand persist hydration ──
  useEffect(() => {
    // Zustand persist middleware auto-hydrates from localStorage on mount.
    // We wait one tick to ensure hydration has completed.
    const t = setTimeout(() => setHydrated(true), 0);
    return () => clearTimeout(t);
  }, []);

  // ── Step 2: Proactively refresh token on cold start (page reload) ──
  useEffect(() => {
    if (!hydrated) return;

    // Set up token getters for httpClient
    httpClient.setTokenGetter(() => {
      try {
        const raw = localStorage.getItem("mythfood-auth");
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.state?.token || null;
        }
      } catch {}
      return null;
    });

    httpClient.setRefreshTokenGetter(() => {
      try {
        const raw = localStorage.getItem("mythfood-auth");
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.state?.refreshToken || null;
        }
      } catch {}
      return null;
    });

    httpClient.setOnTokenRefreshed((tokens) => {
      setTokens(tokens.accessToken, tokens.refreshToken);
    });

    httpClient.setOnAuthFailure(() => {
      clearAuth();
    });

    // Proactive refresh: if we have a stored token, try to refresh it immediately
    // so page reload doesn't cause redirect to login
    async function initAuth() {
      if (token && isAuthenticated) {
        // We have a stored token – verify it works by fetching profile
        try {
          const res = await fetch(
            `${API_BASE_URL.includes("3001") ? "http://localhost:3001" : API_BASE_URL}/api/v1/auth/me`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (res.ok) {
            const data = await res.json();
            const profile = data.data || data;
            if (profile && profile.id && user) {
              // Token still valid, update user info if needed
              setAuth(
                token,
                {
                  ...user,
                  fullName: profile.fullName || user.fullName,
                  roles: profile.roles || user.roles,
                },
                refreshToken || undefined,
              );
            }
          } else if (res.status === 401 && refreshToken) {
            // Token expired, try refresh
            try {
              const refreshRes = await fetch(
                `${API_BASE_URL.includes("3001") ? "http://localhost:3001" : API_BASE_URL}/api/v1/auth/refresh`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ refreshToken }),
                },
              );
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                const newTokens = refreshData.data;
                if (newTokens && newTokens.accessToken) {
                  setTokens(newTokens.accessToken, newTokens.refreshToken);
                  // Re-fetch profile with new token
                  try {
                    const retryRes = await fetch(
                      `${API_BASE_URL.includes("3001") ? "http://localhost:3001" : API_BASE_URL}/api/v1/auth/me`,
                      {
                        headers: {
                          Authorization: `Bearer ${newTokens.accessToken}`,
                        },
                      },
                    );
                    if (retryRes.ok) {
                      const profileData = await retryRes.json();
                      const profile = profileData.data || profileData;
                      if (profile && profile.id) {
                        setAuth(
                          newTokens.accessToken,
                          profile,
                          newTokens.refreshToken,
                        );
                      }
                    }
                  } catch {}
                }
              } else {
                // Refresh failed – clear auth
                clearAuth();
              }
            } catch {
              // Network error during refresh – keep existing state, let httpClient handle later
            }
          }
        } catch {
          // Network error – keep existing state
        }
      }
      setAuthReady(true);
    }

    initAuth();
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 3: If no stored auth, mark ready immediately ──
  useEffect(() => {
    if (hydrated && !token) {
      setAuthReady(true);
    }
  }, [hydrated, token]);

  // Show loading spinner while auth is initializing (prevents flash of login redirect)
  if (!hydrated || !authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Đang khởi động...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
