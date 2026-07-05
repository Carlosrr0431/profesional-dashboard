'use client';

import dynamic from 'next/dynamic';
import AdminAuthGate from '../../../src/components/admin/AdminAuthGate';
import { ToastProvider } from '../../../src/context/ToastContext';

const App = dynamic(() => import('../../../src/App'), { ssr: false });

export default function AdminDashboardPage() {
  return (
    <ToastProvider>
      <AdminAuthGate>
        <App />
      </AdminAuthGate>
    </ToastProvider>
  );
}
