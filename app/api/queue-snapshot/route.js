import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

function waitMinutes(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 60000));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const queueSelect =
      'id, passenger_name, passenger_phone, origin_address, destination_address, destination_lat, destination_lng, price, distance_km, duration_minutes, dispatch_attempts, notes, created_at, dispatch_status, status, next_after_trip_id, driver_id';

    const [{ data: queuedTripsRaw, error: queuedErr }, { data: nextTripOffersRaw, error: nextTripErr }] = await Promise.all([
      supabase
        .from('trips')
        .select(queueSelect)
        .eq('status', 'queued')
        .order('created_at', { ascending: true }),
      supabase
        .from('trips')
        .select(queueSelect)
        .eq('status', 'pending')
        .not('next_after_trip_id', 'is', null)
        .order('created_at', { ascending: true }),
    ]);

    if (queuedErr) throw queuedErr;
    if (nextTripErr) throw nextTripErr;

    const queuedTrips = [...(queuedTripsRaw || []), ...(nextTripOffersRaw || [])]
      .filter((t) => t.dispatch_status !== 'hold')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Log de viajes recientes creados desde WhatsApp (marcados [APPROACH_ONLY])
    // Incluye todos los estados: pending, accepted, in_progress, completed, cancelled
    const { data: recentTrips, error: recentErr } = await supabase
      .from('trips')
      .select(
        'id, passenger_name, passenger_phone, destination_address, origin_address, ' +
        'status, created_at, accepted_at, started_at, completed_at, notes, driver_id, cancel_reason, next_after_trip_id'
      )
      .ilike('notes', '%APPROACH_ONLY%')
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentErr) throw recentErr;

    // Cargar datos de choferes para los viajes del log
    const driverIds = [...new Set((recentTrips || []).map((t) => t.driver_id).filter(Boolean))];
    let driversMap = {};
    if (driverIds.length > 0) {
      const { data: driversData, error: driversErr } = await supabase
        .from('drivers')
        .select('id, full_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_color')
        .in('id', driverIds);
      if (driversErr) throw driversErr;
      (driversData || []).forEach((d) => { driversMap[d.id] = d; });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const queue = (queuedTrips || []).map((trip, index) => ({
      id: trip.id,
      position: index + 1,
      phone: trip.passenger_phone,
      passengerName: trip.passenger_name || 'Pasajero',
      originAddress: trip.origin_address || null,
      destinationAddress: trip.destination_address || null,
      pickupAddress: trip.origin_address || trip.destination_address || '—',
      queuedAt: trip.created_at,
      waitMinutes: waitMinutes(trip.created_at),
      price: trip.price ? Number(trip.price) : null,
      distanceKm: trip.distance_km ? Number(trip.distance_km) : null,
      durationMinutes: trip.duration_minutes ? Number(trip.duration_minutes) : null,
      dispatchAttempts: trip.dispatch_attempts ?? 0,
      notes: trip.notes || null,
      status: trip.status || 'queued',
      nextAfterTripId: trip.next_after_trip_id || null,
    }));

    const log = (recentTrips || []).map((trip) => ({
      id: trip.id,
      passengerName: trip.passenger_name || 'Pasajero',
      passengerPhone: trip.passenger_phone,
      pickupAddress: trip.destination_address || '—',
      driverOrigin: trip.origin_address || '—',
      status: trip.status,
      cancelReason: trip.cancel_reason || null,
      dispatchedAt: trip.created_at,
      acceptedAt: trip.accepted_at,
      startedAt: trip.started_at,
      completedAt: trip.completed_at,
      driver: driversMap[trip.driver_id] || null,
      isToday: new Date(trip.created_at) >= todayStart,
      nextAfterTripId: trip.next_after_trip_id || null,
    }));

    return NextResponse.json({ ok: true, data: { queue, log } });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
          details: err?.details || null,
          hint: err?.hint || null,
        },
      },
      { status: 500 }
    );
  }
}
