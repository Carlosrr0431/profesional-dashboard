import { NextResponse } from 'next/server';
import { loadFrequentPickups } from '../../../../src/lib/frequentTripCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_MS = 5 * 60_000;
let cached = null;
let inflight = null;

export async function GET() {
  try {
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json({ ok: true, items: cached.items });
    }
    if (!inflight) {
      inflight = loadFrequentPickups()
        .then((items) => {
          cached = { items, expires: Date.now() + CACHE_MS };
          return items;
        })
        .finally(() => { inflight = null; });
    }
    return NextResponse.json({ ok: true, items: await inflight });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'No se pudieron cargar los retiros frecuentes.' },
      { status: 500 },
    );
  }
}
