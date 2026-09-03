import { shouldPreservePickupOriginOnAssign } from '../../shared/trip-contract.js';

export const ASSIGNABLE_EXISTING_TRIP_STATUSES = ['scheduled', 'queued', 'pending'];
export const DRIVER_BUSY_TRIP_STATUSES = ['pending', 'accepted', 'going_to_pickup', 'in_progress'];

const ASSIGNABLE = new Set(ASSIGNABLE_EXISTING_TRIP_STATUSES);

export function canManuallyAssignExistingTrip(trip) {
  return ASSIGNABLE.has(String(trip?.status || '').toLowerCase());
}

export function hasValidDriverGps(driver) {
  const lat = Number(driver?.current_lat ?? driver?.lat);
  const lng = Number(driver?.current_lng ?? driver?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

export function isFreeDashboardDriver(driver) {
  return Boolean(driver?.isOnline && !driver?.dispatchBlocked && !driver?.activeTrip);
}

export function listFreeDashboardDrivers(drivers) {
  return (Array.isArray(drivers) ? drivers : [])
    .filter(isFreeDashboardDriver)
    .slice()
    .sort((a, b) => {
      const numA = Number(a?.driverNumber);
      const numB = Number(b?.driverNumber);
      if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
      const nameA = String(a?.fullName || a?.full_name || '');
      const nameB = String(b?.fullName || b?.full_name || '');
      return nameA.localeCompare(nameB, 'es');
    });
}

export function driverDisplayName(driver) {
  return String(driver?.fullName || driver?.full_name || 'Chofer').trim() || 'Chofer';
}

export function parseDriverNumberInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function findDashboardDriversByNumber(drivers, value) {
  const n = parseDriverNumberInput(value);
  if (n == null) return [];
  return (Array.isArray(drivers) ? drivers : []).filter(
    (driver) => Number(driver?.driverNumber) === n,
  );
}

export function resolvePreferredDriverId(waContext) {
  let context = waContext;
  if (typeof context === 'string') {
    try { context = JSON.parse(context); } catch { context = {}; }
  }
  if (!context || typeof context !== 'object') return null;
  const raw = context.preferred_driver_id || context.preferredDriverId || '';
  return String(raw || '').trim() || null;
}

export function mergePreferredDriverWaContext(waContext, driverId) {
  const preferredDriverId = String(driverId || '').trim();
  const context = waContext && typeof waContext === 'object' ? { ...waContext } : {};
  if (!preferredDriverId) {
    delete context.preferred_driver_id;
    return Object.keys(context).length ? context : null;
  }
  context.source = context.source || 'dashboard';
  context.preferred_driver_id = preferredDriverId;
  return context;
}

export function dashboardDriverAvailability(driver) {
  if (!driver) return { code: 'missing', label: 'Sin chofer', canAssign: false };
  if (driver.dispatchBlocked) {
    return {
      code: 'blocked',
      label: driver.commissionBlocked ? 'Bloqueo manual' : 'Bloqueado por comisión',
      canAssign: false,
    };
  }
  if (driver.activeTrip) {
    return { code: 'busy', label: 'En viaje', canAssign: false };
  }
  if (!driver.isOnline) {
    return { code: 'offline', label: 'Desconectado', canAssign: false };
  }
  return { code: 'free', label: 'Disponible', canAssign: true };
}

export function buildAssignExistingTripUpdate({ trip, driver, assignedAt }) {
  const lat = Number(driver?.current_lat ?? driver?.lat);
  const lng = Number(driver?.current_lng ?? driver?.lng);
  const update = {
    driver_id: driver.id,
    status: 'pending',
    assigned_at: assignedAt,
    dispatch_status: 'waiting_acceptance',
  };

  if (!shouldPreservePickupOriginOnAssign(trip) && hasValidDriverGps({ current_lat: lat, current_lng: lng })) {
    update.origin_address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    update.origin_lat = lat;
    update.origin_lng = lng;
  }

  return update;
}
