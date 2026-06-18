import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ACTIVE_TRIP_STATUSES = ['accepted', 'going_to_pickup', 'in_progress'];

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

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveCommissionOverdue(pendingCommission, lastCommissionPaymentAt) {
  const balance = Math.max(0, toNumber(pendingCommission, 0));
  if (balance <= 0) return false;

  const lastPayment = lastCommissionPaymentAt ? new Date(lastCommissionPaymentAt) : null;
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  return !lastPayment || lastPayment < threeDaysAgo;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const [driversRes, locationsRes, activeTripsRes, vtRes] = await Promise.all([
      supabase.from('drivers').select('*'),
      supabase.from('driver_locations').select('*'),
      supabase
        .from('trips')
        .select('driver_id, status, passenger_name, destination_address')
        .in('status', ACTIVE_TRIP_STATUSES),
      supabase.from('settings').select('key, value').like('key', 'vehicle_type_%'),
    ]);

    if (driversRes.error) throw driversRes.error;

    const locationsMap = {};
    (locationsRes.data || []).forEach((loc) => {
      if (loc?.driver_id) locationsMap[loc.driver_id] = loc;
    });

    const activeTripsMap = {};
    (activeTripsRes.data || []).forEach((trip) => {
      if (trip?.driver_id) activeTripsMap[trip.driver_id] = trip;
    });

    const vehicleTypeMap = {};
    (vtRes.data || []).forEach((setting) => {
      const key = String(setting?.key || '');
      if (!key.startsWith('vehicle_type_')) return;
      const driverId = key.replace('vehicle_type_', '');
      vehicleTypeMap[driverId] = setting?.value || 'auto';
    });

    const mapped = (driversRes.data || []).map((driver) => {
      const loc = locationsMap[driver.id];
      const activeTrip = activeTripsMap[driver.id] || null;
      const pendingCommission = Math.max(0, toNumber(driver.pending_commission, 0));
      return {
        id: driver.id,
        lat: toNumber(loc?.lat ?? driver.current_lat, 0),
        lng: toNumber(loc?.lng ?? driver.current_lng, 0),
        speed: toNumber(loc?.speed, 0),
        heading: toNumber(loc?.heading, 0),
        isOnline: Boolean(driver.is_available),
        updatedAt: loc?.updated_at || driver.updated_at,
        fullName: driver.full_name || 'Sin nombre',
        driverNumber: driver.driver_number || null,
        phone: driver.phone || '',
        photoUrl: driver.photo_url || '',
        vehicleBrand: driver.vehicle_brand || '',
        vehicleModel: driver.vehicle_model || '',
        vehiclePlate: driver.vehicle_plate || '',
        vehicleColor: driver.vehicle_color || '',
        vehicleType: driver.vehicle_type || vehicleTypeMap[driver.id] || 'auto',
        isAvailable: Boolean(driver.is_available),
        rating: toNumber(driver.rating, 5),
        totalTrips: toNumber(driver.total_trips, 0),
        activeTrip,
        pendingCommission,
        lastCommissionPaymentAt: driver.last_commission_payment_at || null,
        commissionBalance: pendingCommission,
        commissionOverdue: resolveCommissionOverdue(
          pendingCommission,
          driver.last_commission_payment_at
        ),
      };
    });

    return NextResponse.json({ ok: true, data: mapped });
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
