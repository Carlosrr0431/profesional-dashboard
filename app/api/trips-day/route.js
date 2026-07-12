import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const LIVE_STATUSES = ['queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress'];

const TRIP_SELECT =
  'id, passenger_name, passenger_phone, origin_address, destination_address, ' +
  'status, created_at, accepted_at, started_at, completed_at, notes, driver_id, ' +
  'cancel_reason, price, distance_km, duration_minutes, commission_amount, dispatch_status';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Día civil en Argentina (UTC-3 fijo, sin DST). date=YYYY-MM-DD */
function dayBoundsArgentina(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) {
    const now = new Date();
    // Convertir "ahora" a fecha civil AR: UTC-3
    const arMs = now.getTime() - 3 * 60 * 60 * 1000;
    const ar = new Date(arMs);
    const y = ar.getUTCFullYear();
    const m = String(ar.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ar.getUTCDate()).padStart(2, '0');
    return dayBoundsArgentina(`${y}-${m}-${d}`);
  }

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  // 00:00 ART = 03:00 UTC del mismo día civil
  const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0, 0));
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const { date, start, end } = dayBoundsArgentina(searchParams.get('date'));
    const supabase = getSupabaseAdmin();

    const [dayResult, liveResult] = await Promise.all([
      supabase
        .from('trips')
        .select(TRIP_SELECT)
        .neq('status', 'scheduled')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('trips')
        .select(TRIP_SELECT)
        .in('status', LIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(150),
    ]);

    if (dayResult.error) throw dayResult.error;
    if (liveResult.error) throw liveResult.error;

    const byId = new Map();
    [...(dayResult.data || []), ...(liveResult.data || [])].forEach((trip) => {
      if (trip.status === 'queued' && trip.dispatch_status === 'hold') return;
      byId.set(trip.id, trip);
    });

    const merged = [...byId.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const driverIds = [...new Set(merged.map((t) => t.driver_id).filter(Boolean))];
    let driversMap = {};
    if (driverIds.length > 0) {
      const { data: driversData, error: driversErr } = await supabase
        .from('drivers')
        .select('id, full_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_color')
        .in('id', driverIds);
      if (driversErr) throw driversErr;
      (driversData || []).forEach((d) => {
        driversMap[d.id] = d;
      });
    }

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    const trips = merged.map((trip) => {
      const createdMs = new Date(trip.created_at).getTime();
      return {
        ...trip,
        driver: trip.driver_id ? driversMap[trip.driver_id] || null : null,
        in_selected_day: Number.isFinite(createdMs) && createdMs >= startMs && createdMs < endMs,
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        date,
        start,
        end,
        trips,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
          details: err?.details || null,
        },
      },
      { status: 500 },
    );
  }
}
