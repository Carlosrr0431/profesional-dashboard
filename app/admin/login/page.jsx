'use client';

import { Suspense } from 'react';
import AdminLoginPage from '../../../src/components/admin/AdminLoginPage';

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1220]">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
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
