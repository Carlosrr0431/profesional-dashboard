import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { markStoredChatRead } from '../../../../src/lib/cloudflareChats';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => null);
  const chatId = String(body?.chatId || '').trim();
  if (!chatId) {
    return NextResponse.json({ ok: false, message: 'Elegí un chat.' }, { status: 400 });
  }
  try {
    await markStoredChatRead(chatId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'No se pudo marcar el chat como leído.' },
      { status: err?.status || 500 },
    );
  }
}
