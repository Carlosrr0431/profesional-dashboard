'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import DashboardLoadingScreen from '../DashboardLoadingScreen';

export default function AdminAuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAdminAuth();

  useEffect(() => {
    if (!loading && !user) {
      const next = pathname?.startsWith('/admin/dashboard')
        ? pathname
        : '/admin/dashboard';
      router.replace(`/admin/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return <DashboardLoadingScreen message="Verificando sesión…" />;
  }

  if (!user) return null;

  return children;
}
