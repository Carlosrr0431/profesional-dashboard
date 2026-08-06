'use client';

import AdminAuthGate from '../../../src/components/admin/AdminAuthGate';

export default function WhatsAppAdminLayout({ children }) {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden overflow-y-auto bg-[#070d1a]">
      <AdminAuthGate>
        {children}
      </AdminAuthGate>
    </div>
  );
}
