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

function parseContext(ctx) {
  if (!ctx) return {};
  if (typeof ctx === 'object') return ctx;
  try {
    return JSON.parse(ctx);
  } catch {
    return {};
  }
}

function waitMinutes(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 60000));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: queued, error: queuedErr } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone, push_name, context, updated_at, status')
      .eq('status', 'queued_no_driver')
      .order('updated_at', { ascending: true });

    if (queuedErr) throw queuedErr;

    const { data: dispatchedTrips, error: tripsErr } = await supabase
      .from('trips')
      .select(
        'id, passenger_name, passenger_phone, destination_address, origin_address, ' +
        'status, created_at, accepted_at, started_at, completed_at, notes, driver_id, cancel_reason'
      )
      .ilike('notes', '%cola de espera%')
      .order('created_at', { ascending: false })
      .limit(30);

    if (tripsErr) throw tripsErr;

    const driverIds = [...new Set((dispatchedTrips || []).map((trip) => trip.driver_id).filter(Boolean))];
    let driversMap = {};
    if (driverIds.length > 0) {
      const { data: driversData, error: driversErr } = await supabase
        .from('drivers')
        .select('id, full_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_color')
        .in('id', driverIds);

      if (driversErr) throw driversErr;
      (driversData || []).forEach((driver) => {
        driversMap[driver.id] = driver;
      });
    }

    const passengerPhones = [...new Set((dispatchedTrips || []).map((trip) => trip.passenger_phone).filter(Boolean))];
    let convByPhone = {};
    if (passengerPhones.length > 0) {
      const { data: convData, error: convErr } = await supabase
        .from('whatsapp_conversations')
        .select('id, phone, context, updated_at, last_trip_id')
        .in('phone', passengerPhones);

      if (convErr) throw convErr;
      (convData || []).forEach((conv) => {
        convByPhone[conv.phone] = conv;
      });
    }

    const queue = (queued || []).map((conv, index) => {
      const ctx = parseContext(conv.context);
      return {
        id: conv.id,
        position: index + 1,
        phone: conv.phone,
        pushName: conv.push_name,
        passengerName: ctx.passenger_name || conv.push_name || 'Pasajero',
        pickupAddress: ctx.pickup_formatted_address || ctx.pickup_location || '—',
        destination: ctx.destination || null,
        queuedAt: conv.updated_at,
        waitMinutes: waitMinutes(conv.updated_at),
        notes: ctx.notes || null,
      };
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const log = (dispatchedTrips || []).map((trip) => {
      const driver = driversMap[trip.driver_id] || null;
      const conv = convByPhone[trip.passenger_phone] || null;
      const isToday = new Date(trip.created_at) >= todayStart;

      let waitedMinutes = null;
      if (conv?.context) {
        parseContext(conv.context);
      }

      return {
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
        driver,
        waitedMinutes,
        isToday,
      };
    });

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
