import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../src/lib/supabaseAdmin';
import { fetchAllPages } from '../../../src/lib/pagedQuery';
import { buildOperatorDemandRows, saltaDayStart } from '../../../src/lib/operatorDemandRows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FLEET_SELECT = 'driver_id, status, created_at, notes, origin_lat, origin_lng, destination_lat, destination_lng';
const OPEN_SELECT = 'id, status, created_at, scheduled_for, notes, origin_lat, origin_lng, origin_address, destination_lat, destination_lng, destination_address';

async function loadRange(supabase, build) {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await build().range(from, to);
    if (error) throw error;
    return data || [];
  });
}

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const dayStart = saltaDayStart(now);
    const fleetFrom = new Date(dayStart.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const fleetUntil = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const queueFrom = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

    const [fleet, scheduledByColumn, scheduledByNote, queued] = await Promise.all([
      loadRange(supabase, () => supabase
        .from('trips')
        .select(FLEET_SELECT)
        .not('driver_id', 'is', null)
        .in('status', ['accepted', 'going_to_pickup', 'in_progress', 'completed'])
        .gte('created_at', fleetFrom)
        .lt('created_at', fleetUntil)),
      loadRange(supabase, () => supabase
        .from('trips')
        .select(OPEN_SELECT)
        .in('status', ['scheduled', 'queued', 'pending'])
        .not('scheduled_for', 'is', null)
        .gte('scheduled_for', queueFrom)),
      loadRange(supabase, () => supabase
        .from('trips')
        .select(OPEN_SELECT)
        .in('status', ['scheduled', 'queued', 'pending'])
        .ilike('notes', '%[SCHEDULED_FOR]%')
        .gte('created_at', fleetFrom)),
      loadRange(supabase, () => supabase
        .from('trips')
        .select(OPEN_SELECT)
        .is('scheduled_for', null)
        .in('status', ['queued', 'pending'])
        .gte('created_at', queueFrom)),
    ]);
    const scheduledById = new Map();
    for (const trip of [...scheduledByColumn, ...scheduledByNote]) {
      if (trip?.id) scheduledById.set(trip.id, trip);
    }
    const scheduled = [...scheduledById.values()];

    return NextResponse.json({
      ok: true,
      rows: buildOperatorDemandRows({ fleet, scheduled, queued }, now),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'No se pudo cargar la demanda' },
      { status: 500 },
    );
  }
}
