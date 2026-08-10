'use client';

import AdminAuthGate from '../../../src/components/admin/AdminAuthGate';

export default function WhatsAppAdminLayout({ children }) {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#060b14]">
      <AdminAuthGate>
        {children}
      </AdminAuthGate>
    </div>
  );
}
