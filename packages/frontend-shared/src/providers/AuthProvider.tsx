'use client';

import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { httpClient } from '@mythfood/api-client';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    httpClient.setTokenGetter(() => {
      // Read directly from localStorage to avoid stale closure
      try {
        const raw = localStorage.getItem('mythfood-auth');
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.state?.token || null;
        }
      } catch {}
      return null;
    });
  }, []);

  return <>{children}</>;
}