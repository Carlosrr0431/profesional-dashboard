'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import DashboardLoadingScreen from '../DashboardLoadingScreen';

export default function AdminAuthGate({ children }) {
  const router = useRouter();
  const { user, loading } = useAdminAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/admin/login?next=/admin/dashboard');
    }
  }, [loading, user, router]);

  if (loading) {
    return <DashboardLoadingScreen message="Verificando sesión…" />;
  }

  if (!user) return null;

  return children;
}
