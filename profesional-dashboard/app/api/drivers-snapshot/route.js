import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildFleetOwnersById,
  mergeAssignedDriverWithOwner,
} from '../../../src/lib/fleetDriverEnrichment';
import { resolveDisplayActiveTrip } from '../../../src/lib/fleetDispatch';
import { isFleetOwner } from '../../../src/lib/driverRoles';

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

function resolveCommissionOverdue(pendingCommission, commissionDebtSinceAt) {
  const balance = Math.max(0, toNumber(pendingCommission, 0));
  if (balance <= 0) return false;

  // La deuda vence cuando lleva más de 3 días sin saldarse.
  // commission_debt_since_at registra cuándo empezó la deuda actual;
  // si es null, la deuda aún no comenzó a contar (no hay vencimiento).
  const debtSince = commissionDebtSinceAt ? new Date(commissionDebtSinceAt) : null;
  if (!debtSince) return false;

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  return debtSince < threeDaysAgo;
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

    const activeTripsList = activeTripsRes.data || [];
    const activeTripsMap = {};
    activeTripsList.forEach((trip) => {
      if (trip?.driver_id) activeTripsMap[trip.driver_id] = trip;
    });
    const vehicleTypeMap = {};
    (vtRes.data || []).forEach((setting) => {
      const key = String(setting?.key || '');
      if (!key.startsWith('vehicle_type_')) return;
      const driverId = key.replace('vehicle_type_', '');
      vehicleTypeMap[driverId] = setting?.value || 'auto';
    });

    const ownersById = buildFleetOwnersById(driversRes.data);

    const mapped = (driversRes.data || []).map((driver) => {
      const owner = driver.owner_id ? ownersById[driver.owner_id] : null;
      const merged = mergeAssignedDriverWithOwner(driver, owner);
      const loc = locationsMap[merged.id];
      const activeTrip = resolveDisplayActiveTrip(merged.id, activeTripsMap);
      const pendingCommission = Math.max(0, toNumber(merged.pending_commission, 0));
      const assigned = Boolean(merged.is_assigned_driver && merged.owner_id);

      return {
        id: merged.id,
        lat: toNumber(loc?.lat ?? merged.current_lat, 0),
        lng: toNumber(loc?.lng ?? merged.current_lng, 0),
        speed: toNumber(loc?.speed, 0),
        heading: toNumber(loc?.heading, 0),
        isOnline: Boolean(merged.is_available),
        updatedAt: loc?.updated_at || merged.updated_at,
        fullName: merged.full_name || 'Sin nombre',
        driverNumber: merged.driver_number ?? null,
        phone: merged.phone || '',
        fleetContactPhone: assigned ? (owner?.phone || '') : (merged.phone || ''),
        photoUrl: merged.photo_url || '',
        vehicleBrand: merged.vehicle_brand || '',
        vehicleModel: merged.vehicle_model || '',
        vehiclePlate: merged.vehicle_plate || '',
        vehicleColor: merged.vehicle_color || '',
        vehicleType: merged.vehicle_type || vehicleTypeMap[merged.id] || 'auto',
        isAvailable: Boolean(merged.is_available),
        rating: toNumber(merged.rating, 5),
        totalTrips: toNumber(merged.total_trips, 0),
        activeTrip,
        pendingCommission,
        lastCommissionPaymentAt: merged.last_commission_payment_at || null,
        commissionBalance: pendingCommission,
        commissionOverdue: resolveCommissionOverdue(
          pendingCommission,
          merged.commission_debt_since_at,
        ),
        isAssignedDriver: assigned,
        isFleetOwner: isFleetOwner(merged),
        ownerId: merged.owner_id || null,
        ownerName: assigned ? (owner?.full_name || 'Propietario') : null,
        ownerPhone: assigned ? (owner?.phone || '') : null,
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
