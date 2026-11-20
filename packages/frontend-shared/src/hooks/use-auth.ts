import { useCallback } from "react";
import { authApi, httpClient } from "@mythfood/api-client";
import type { LoginRequest, RegisterRequest } from "@mythfood/api-client";
import { useAuthStore } from "../stores/auth.store";
import { canAccessApp as checkAppAccess } from "../utils/role-access";
import type { AppKey } from "../utils/role-access";

// Connect auth token to HTTP client
useAuthStore.subscribe((state) => {
  httpClient.setTokenGetter(() => state.token);
});

export function useAuth() {
  const {
    token,
    user,
    isAuthenticated,
    setAuth,
    clearAuth,
    hasRole,
    hasAnyRole,
  } = useAuthStore();

  const login = useCallback(
    async (data: LoginRequest) => {
      const res = await authApi.login(data);
      setAuth(res.data.accessToken, res.data.user);
      return res.data;
    },
    [setAuth],
  );

  const register = useCallback(async (data: RegisterRequest) => {
    const res = await authApi.register(data);
    return res.data;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const canAccessApp = useCallback(
    (app: AppKey) => checkAppAccess(user?.roles, app),
    [user],
  );

  return {
    token,
    user,
    isAuthenticated,
    login,
    register,
    logout,
    hasRole,
    hasAnyRole,
    canAccessApp,
  };
}
