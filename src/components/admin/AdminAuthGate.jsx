'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import DashboardBrand from '../DashboardBrand';

export default function AdminAuthGate({ children }) {
  const router = useRouter();
  const { user, loading } = useAdminAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/admin/login?next=/admin/dashboard');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-[3px] border-navy-900/15 rounded-full" />
            <div className="absolute inset-0 border-[3px] border-navy-900 border-t-transparent rounded-full animate-spin" />
          </div>
          <DashboardBrand className="justify-center" imageClassName="h-10 w-auto max-w-[150px] object-contain" />
          <p className="text-gray-400 text-xs">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return children;
}
