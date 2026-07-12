import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveTripsViewRange, toAnchorString } from '../../../src/lib/commissionPaymentPeriods';

const LIVE_STATUSES = ['queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress'];

const TRIP_SELECT =
  'id, passenger_name, passenger_phone, origin_address, destination_address, ' +
  'status, created_at, accepted_at, started_at, completed_at, notes, driver_id, ' +
  'cancel_reason, price, distance_km, duration_minutes, commission_amount, dispatch_status';

const RANGE_LIMITS = {
  day: 400,
  week: 1200,
  month: 2500,
};

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

function normalizeMode(raw) {
  const mode = String(raw || 'day').trim().toLowerCase();
  if (mode === 'week' || mode === 'month') return mode;
  return 'day';
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = normalizeMode(searchParams.get('mode') || searchParams.get('period'));
    const dateParam = searchParams.get('date') || searchParams.get('month') || toAnchorString();
    const range = resolveTripsViewRange(mode, dateParam);
    const limit = RANGE_LIMITS[range.mode] || RANGE_LIMITS.day;
    const supabase = getSupabaseAdmin();

    const [rangeResult, liveResult] = await Promise.all([
      supabase
        .from('trips')
        .select(TRIP_SELECT)
        .neq('status', 'scheduled')
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('trips')
        .select(TRIP_SELECT)
        .in('status', LIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(150),
    ]);

    if (rangeResult.error) throw rangeResult.error;
    if (liveResult.error) throw liveResult.error;

    const byId = new Map();
    [...(rangeResult.data || []), ...(liveResult.data || [])].forEach((trip) => {
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

    const startMs = new Date(range.start).getTime();
    const endMs = new Date(range.end).getTime();

    const trips = merged.map((trip) => {
      const createdMs = new Date(trip.created_at).getTime();
      const inSelectedRange = Number.isFinite(createdMs) && createdMs >= startMs && createdMs < endMs;
      return {
        ...trip,
        driver: trip.driver_id ? driversMap[trip.driver_id] || null : null,
        in_selected_day: inSelectedRange,
        in_selected_range: inSelectedRange,
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        mode: range.mode,
        date: range.date,
        label: range.label,
        start: range.start,
        end: range.end,
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
