import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import { buildDashboardAssignNotes } from '../../../../src/lib/tripRequeue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeText(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen);
}

/**
 * Asigna un viaje desde el dashboard (bypass RLS con service role).
 * El browser client autenticado no puede INSERT en trips: la RLS solo
 * permite INSERT a rol anon, no a authenticated.
 */
export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, message: auth.error || 'No autorizado' },
      { status: auth.status || 401 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 });
  }

  const driverId = String(body?.driver_id || body?.driverId || '').trim();
  const destinationAddress = sanitizeText(body?.destination_address || body?.pickupAddress);
  const destinationLat = toNumberOrNull(body?.destination_lat ?? body?.pickupLat);
  const destinationLng = toNumberOrNull(body?.destination_lng ?? body?.pickupLng);

  if (!driverId) {
    return NextResponse.json({ ok: false, message: 'Falta el chofer.' }, { status: 400 });
  }
  if (!destinationAddress || destinationLat == null || destinationLng == null) {
    return NextResponse.json(
      { ok: false, message: 'Ingresá la dirección de recogida del pasajero.' },
      { status: 400 },
    );
  }

  const dropoffAddress = sanitizeText(body?.dropoff_address || body?.dropoffAddress || 'A confirmar');
  const dropoffLat = toNumberOrNull(body?.dropoff_lat ?? body?.dropoffLat);
  const dropoffLng = toNumberOrNull(body?.dropoff_lng ?? body?.dropoffLng);
  const userNotes = sanitizeText(body?.notes || body?.userNotes, 1000);

  const driverLat = toNumberOrNull(body?.origin_lat ?? body?.driverLat);
  const driverLng = toNumberOrNull(body?.origin_lng ?? body?.driverLng);
  const hasDriverCoords =
    driverLat != null
    && driverLng != null
    && !(driverLat === 0 && driverLng === 0);

  const tripNotes = buildDashboardAssignNotes({
    userNotes,
    dropoffAddress,
    dropoffLat,
    dropoffLng,
  });

  const tripData = {
    driver_id: driverId,
    passenger_name: sanitizeText(body?.passenger_name || body?.passengerName || 'Pasajero', 120) || 'Pasajero',
    passenger_phone: sanitizeText(body?.passenger_phone || body?.passengerPhone, 40) || null,
    destination_address: destinationAddress,
    destination_lat: destinationLat,
    destination_lng: destinationLng,
    origin_address: hasDriverCoords
      ? (sanitizeText(body?.origin_address) || `${driverLat.toFixed(5)}, ${driverLng.toFixed(5)}`)
      : null,
    origin_lat: hasDriverCoords ? driverLat : null,
    origin_lng: hasDriverCoords ? driverLng : null,
    status: 'pending',
    dispatch_status: 'waiting_acceptance',
    assigned_at: new Date().toISOString(),
    price: toNumberOrNull(body?.price),
    commission_amount: toNumberOrNull(body?.commission_amount ?? body?.commissionAmount),
    distance_km: toNumberOrNull(body?.distance_km ?? body?.distanceKm),
    duration_minutes: toNumberOrNull(body?.duration_minutes ?? body?.durationMinutes),
    notes: tripNotes,
    wa_context: { dispatch_excluded_driver_ids: [], source: 'dashboard_assign' },
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('trips').insert(tripData).select().single();
    if (error) {
      console.error('[trips/assign]', error);
      return NextResponse.json(
        { ok: false, message: error.message || 'No se pudo crear el viaje.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, trip: data });
  } catch (err) {
    console.error('[trips/assign]', err);
    return NextResponse.json(
      { ok: false, message: err.message || 'Error al crear el viaje.' },
      { status: 500 },
    );
  }
}
