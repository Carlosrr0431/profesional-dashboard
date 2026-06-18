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

    // Cola de espera: viajes sin chofer asignado (status='queued'), orden FIFO
    const { data: queuedTripsRaw, error: queuedErr } = await supabase
      .from('trips')
      .select('id, passenger_name, passenger_phone, destination_address, destination_lat, destination_lng, notes, created_at, dispatch_status')
      .eq('status', 'queued')
      .order('created_at', { ascending: true });

    // Excluir placeholders en 'hold' que aún esperan respuesta de poll
    const queuedTrips = (queuedTripsRaw || []).filter(
      (t) => t.dispatch_status !== 'hold'
    );

    if (queuedErr) throw queuedErr;

    // Log de viajes recientes creados desde WhatsApp (marcados [APPROACH_ONLY])
    // Incluye todos los estados: pending, accepted, in_progress, completed, cancelled
    const { data: recentTrips, error: recentErr } = await supabase
      .from('trips')
      .select(
        'id, passenger_name, passenger_phone, destination_address, origin_address, ' +
        'status, created_at, accepted_at, started_at, completed_at, notes, driver_id, cancel_reason'
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
      pickupAddress: trip.destination_address || '—',
      queuedAt: trip.created_at,
      waitMinutes: waitMinutes(trip.created_at),
      notes: trip.notes || null,
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
