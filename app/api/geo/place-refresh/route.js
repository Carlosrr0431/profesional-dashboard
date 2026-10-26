import { NextResponse } from 'next/server';
import { refreshStaleGooglePlace } from '../../../../src/lib/refreshStaleGooglePlace';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const placeId = String(new URL(request.url).searchParams.get('placeId') || '').trim();
  const title = String(new URL(request.url).searchParams.get('title') || '').trim();
  if (!placeId.startsWith('google:')) {
    return NextResponse.json({ ok: true, data: { status: 'skip' } });
  }

  const data = await refreshStaleGooglePlace({ placeId, title });
  return NextResponse.json({ ok: true, data });
}
