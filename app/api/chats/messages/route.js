import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { listStoredMessages } from '../../../../src/lib/cloudflareChats';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }
  const { searchParams } = new URL(request.url);
  const chat = String(searchParams.get('chat') || '').trim();
  const before = String(searchParams.get('before') || '').trim();
  if (!chat) {
    return NextResponse.json({ ok: false, message: 'Elegí un chat.' }, { status: 400 });
  }
  try {
    const data = await listStoredMessages(chat, before);
    return NextResponse.json({
      ok: true,
      messages: data.messages || [],
      hasMore: Boolean(data.hasMore),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'No se pudo leer el historial.' },
      { status: err?.status || 500 },
    );
  }
}
