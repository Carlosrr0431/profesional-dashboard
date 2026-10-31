import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const NEAR_KM = 2;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase env vars');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function driverFromJwt(request) {
  const authHeader = request.headers.get('authorization') || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return { error: NextResponse.json({ ok: false, message: 'No autenticado' }, { status: 401 }) };
  const supabase = getSupabaseAdmin();
  const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData?.user) {
    return { error: NextResponse.json({ ok: false, message: 'Token inválido' }, { status: 401 }) };
  }
  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, phone, is_available')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!driver?.id) {
    return { error: NextResponse.json({ ok: false, message: 'Conductor no encontrado' }, { status: 403 }) };
  }
  return { supabase, driver };
}

export async function POST(request) {
  try {
    const auth = await driverFromJwt(request);
    if (auth.error) return auth.error;
    const { supabase, driver } = auth;
    if (!driver.is_available) return NextResponse.json({ ok: true, trip: null });

    const body = await request.json().catch(() => ({}));
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, message: 'Falta la ubicación del móvil' }, { status: 400 });
    }

    const { data: busy } = await supabase
      .from('trips')
      .select('id')
      .eq('driver_id', driver.id)
      .in('status', ['pending', 'accepted', 'going_to_pickup', 'in_progress'])
      .limit(1)
      .maybeSingle();
    if (busy?.id) return NextResponse.json({ ok: true, trip: null });

    const { data: queued, error } = await supabase
      .from('trips')
      .select('*')
      .eq('status', 'queued')
      .is('driver_id', null)
      .order('created_at', { ascending: true })
      .limit(40);
    if (error) throw error;

    let nearest = null;
    let nearestKm = NEAR_KM;
    for (const trip of queued || []) {
      const tripLat = Number(trip.origin_lat);
      const tripLng = Number(trip.origin_lng);
      if (!Number.isFinite(tripLat) || !Number.isFinite(tripLng)) continue;
      const km = haversineKm(lat, lng, tripLat, tripLng);
      if (km <= nearestKm) {
        nearest = trip;
        nearestKm = km;
      }
    }
    if (!nearest) return NextResponse.json({ ok: true, trip: null });

    const assignedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from('trips')
      .update({
        driver_id: driver.id,
        status: 'pending',
        assigned_at: assignedAt,
        dispatch_status: 'waiting_acceptance',
      })
      .eq('id', nearest.id)
      .eq('status', 'queued')
      .is('driver_id', null)
      .select('*')
      .maybeSingle();
    if (claimError) throw claimError;
    return NextResponse.json({ ok: true, trip: claimed || null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'No se pudo buscar viajes cerca' },
      { status: 500 },
    );
  }
}
