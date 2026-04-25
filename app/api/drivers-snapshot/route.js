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

function buildCommissionMap(commTrips = [], commPayments = []) {
  const commissionMap = {};
  const driverComm = {};

  commTrips.forEach((trip) => {
    if (!trip.driver_id) return;
    if (!driverComm[trip.driver_id]) driverComm[trip.driver_id] = { total: 0, trips: [] };
    driverComm[trip.driver_id].total += toNumber(trip.commission_amount, 0);
    driverComm[trip.driver_id].trips.push(trip);
  });

  const driverPaid = {};
  commPayments.forEach((payment) => {
    if (!payment.driver_id) return;
    if (!driverPaid[payment.driver_id]) driverPaid[payment.driver_id] = { total: 0, lastDate: null };
    driverPaid[payment.driver_id].total += toNumber(payment.amount, 0);
    if (!driverPaid[payment.driver_id].lastDate) driverPaid[payment.driver_id].lastDate = payment.created_at;
  });

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  Object.keys(driverComm).forEach((driverId) => {
    const total = driverComm[driverId].total;
    const paid = driverPaid[driverId]?.total || 0;
    const balance = Math.round((total - paid) * 100) / 100;
    const lastPayDate = driverPaid[driverId]?.lastDate ? new Date(driverPaid[driverId].lastDate) : null;
    const trips = [...driverComm[driverId].trips].sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
    const unpaid = lastPayDate
      ? trips.filter((trip) => new Date(trip.completed_at) > lastPayDate)
      : trips;
    const oldest = unpaid.length > 0 ? unpaid[0] : null;
    const isOverdue = balance > 0 && oldest && new Date(oldest.completed_at) < threeDaysAgo;

    commissionMap[driverId] = { total, paid, balance, isOverdue };
  });

  return commissionMap;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const [driversRes, locationsRes, activeTripsRes, vtRes, commTripsRes, commPaymentsRes] = await Promise.all([
      supabase.from('drivers').select('*'),
      supabase.from('driver_locations').select('*'),
      supabase
        .from('trips')
        .select('driver_id, status, passenger_name, destination_address')
        .in('status', ACTIVE_TRIP_STATUSES),
      supabase.from('settings').select('key, value').like('key', 'vehicle_type_%'),
      supabase
        .from('trips')
        .select('driver_id, commission_amount, completed_at')
        .eq('status', 'completed')
        .gt('commission_amount', 0),
      supabase
        .from('commission_payments')
        .select('driver_id, amount, created_at')
        .order('created_at', { ascending: false }),
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

    const commissionMap = buildCommissionMap(commTripsRes.data || [], commPaymentsRes.data || []);

    const mapped = (driversRes.data || []).map((driver) => {
      const loc = locationsMap[driver.id];
      const activeTrip = activeTripsMap[driver.id] || null;
      return {
        id: driver.id,
        lat: toNumber(loc?.lat ?? driver.current_lat, 0),
        lng: toNumber(loc?.lng ?? driver.current_lng, 0),
        speed: toNumber(loc?.speed, 0),
        heading: toNumber(loc?.heading, 0),
        isOnline: loc ? Boolean(loc.is_online) : Boolean(driver.is_available),
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
        commissionBalance: commissionMap[driver.id]?.balance || 0,
        commissionOverdue: commissionMap[driver.id]?.isOverdue || false,
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
