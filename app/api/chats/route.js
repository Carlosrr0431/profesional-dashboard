import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../src/lib/adminAuthServer';
import { listStoredChats } from '../../../src/lib/cloudflareChats';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }
  try {
    const data = await listStoredChats();
    return NextResponse.json({ ok: true, linePhone: data.linePhone, chats: data.chats || [] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'No se pudo leer los chats.' },
      { status: err?.status || 500 },
    );
  }
}
