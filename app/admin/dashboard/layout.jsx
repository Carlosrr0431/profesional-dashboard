'use client';

import dynamic from 'next/dynamic';
import AdminAuthGate from '../../../src/components/admin/AdminAuthGate';
import { ToastProvider } from '../../../src/context/ToastContext';

const App = dynamic(() => import('../../../src/App'), { ssr: false });

export default function AdminDashboardLayout({ children }) {
  return (
    <div className="h-dvh w-full overflow-hidden">
      <ToastProvider>
        <AdminAuthGate>
          <App />
        </AdminAuthGate>
      </ToastProvider>
      {/* Slot de página: solo mantiene la ruta; el shell vive arriba y no se remonta */}
      <div hidden aria-hidden="true">{children}</div>
    </div>
  );
}
