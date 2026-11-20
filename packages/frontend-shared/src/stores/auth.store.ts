import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserProfile, UserRole } from "@mythfood/api-client";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: UserProfile, refreshToken?: string) => void;
  setTokens: (token: string, refreshToken: string) => void;
  clearAuth: () => void;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token: string, user: UserProfile, refreshToken?: string) =>
        set({
          token,
          user,
          refreshToken: refreshToken || null,
          isAuthenticated: true,
        }),

      setTokens: (token: string, refreshToken: string) =>
        set({ token, refreshToken }),

      clearAuth: () =>
        set({
          token: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),

      hasRole: (role: UserRole) => {
        const user = get().user;
        return user?.roles.includes(role) ?? false;
      },

      hasAnyRole: (roles: UserRole[]) => {
        const user = get().user;
        return roles.some((r) => user?.roles.includes(r)) ?? false;
      },
    }),
    {
      name: "mythfood-auth",
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
