import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import { fetchAllPages, SUPABASE_PAGE_SIZE } from '../../../../src/lib/pagedQuery';
import { isWithinServiceArea } from '../../../../src/lib/constants';
import { buildFrequentPickups } from '../../../../src/lib/frequentPickups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_MS = 5 * 60_000;
const TRIP_SELECT = 'id, status, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, notes, created_at';

let cached = null;
let inflight = null;

async function loadFrequentPickups() {
  const supabase = getSupabaseAdmin();
  // Cancelados afuera: pueden tener el retiro mal ubicado y acá se deriva sin revisar.
  const trips = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from('trips')
      .select(TRIP_SELECT)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return data || [];
  }, SUPABASE_PAGE_SIZE, 6);
  return buildFrequentPickups(trips, { isAllowed: isWithinServiceArea });
}

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
