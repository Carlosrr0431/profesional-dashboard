'use client';

import { Suspense } from 'react';
import AdminLoginPage from '../../../src/components/admin/AdminLoginPage';

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 border-[3px] border-navy-900/15 rounded-full" />
        <div className="absolute inset-0 border-[3px] border-navy-900 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

export default function AdminLoginRoute() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <AdminLoginPage />
    </Suspense>
  );
}
