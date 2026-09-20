import {
  isCoordLikeAddress,
  isPassengerAppTrip,
  shouldPreservePickupOriginOnAssign,
} from '../../shared/trip-contract.js';

export const ASSIGNABLE_EXISTING_TRIP_STATUSES = ['scheduled', 'queued', 'pending'];
export const DRIVER_BUSY_TRIP_STATUSES = ['pending', 'accepted', 'going_to_pickup', 'in_progress'];

const ASSIGNABLE = new Set(ASSIGNABLE_EXISTING_TRIP_STATUSES);

export function canManuallyAssignExistingTrip(trip) {
  return ASSIGNABLE.has(String(trip?.status || '').toLowerCase());
}

export function hasValidDriverGps(driver) {
  const { lat, lng } = resolveAssignDriverGps(driver);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

export function resolveAssignDriverGps(driver) {
  const mapLat = Number(driver?.lat);
  const mapLng = Number(driver?.lng);
  if (Number.isFinite(mapLat) && Number.isFinite(mapLng) && !(mapLat === 0 && mapLng === 0)) {
    return { lat: mapLat, lng: mapLng };
  }
  return {
    lat: Number(driver?.current_lat),
    lng: Number(driver?.current_lng),
  };
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

export function parseWaContextObject(waContext) {
  if (!waContext) return {};
  if (typeof waContext === 'object') return { ...waContext };
  if (typeof waContext !== 'string') return {};
  try {
    const parsed = JSON.parse(waContext);
    return parsed && typeof parsed === 'object' ? { ...parsed } : {};
  } catch {
    return {};
  }
}

export function resolvePreferredDriverId(waContext) {
  const context = parseWaContextObject(waContext);
  const raw = context.preferred_driver_id || context.preferredDriverId || '';
  return String(raw || '').trim() || null;
}

function shouldPreserveChannelSource(trip) {
  if (isPassengerAppTrip(trip)) return true;
  const source = String(parseWaContextObject(trip?.wa_context).source || '').trim();
  if (source === 'whatsapp' || source === 'passenger_app' || source === 'passenger_web') return true;
  const notes = String(trip?.notes || '').toLowerCase();
  return notes.includes('[passenger_app]')
    || notes.includes('[passenger_web]')
    || notes.includes('[whatsapp]')
    || notes.includes('[wa_');
}

/** El operador eligió un móvil concreto: no debe cazar al más cercano. */
export function appendDashboardAssignNotes(notes) {
  const text = String(notes || '');
  if (text.toLowerCase().includes('[dashboard_assign]')) return text;
  if (text.includes('[DASHBOARD]')) {
    return text.replace('[DASHBOARD]', '[DASHBOARD]\n[DASHBOARD_ASSIGN]');
  }
  if (text.includes('[APPROACH_ONLY]')) {
    return text.replace('[APPROACH_ONLY]', '[APPROACH_ONLY]\n[DASHBOARD_ASSIGN]');
  }
  return text ? `${text}\n[DASHBOARD_ASSIGN]` : '[DASHBOARD_ASSIGN]';
}

export function mergePreferredDriverWaContext(waContext, driverId) {
  const preferredDriverId = String(driverId || '').trim();
  const context = parseWaContextObject(waContext);
  if (!preferredDriverId) {
    delete context.preferred_driver_id;
    return Object.keys(context).length ? context : null;
  }
  context.source = 'dashboard_assign';
  context.manual_assign = true;
  context.preferred_driver_id = preferredDriverId;
  return context;
}

export function stampManualDashboardAssign({ trip, driverId } = {}) {
  const context = parseWaContextObject(trip?.wa_context);
  const preferredDriverId = String(driverId || '').trim();
  if (preferredDriverId) context.preferred_driver_id = preferredDriverId;
  context.manual_assign = true;
  const preserveChannel = shouldPreserveChannelSource(trip);
  if (!preserveChannel) context.source = 'dashboard_assign';
  const update = { wa_context: context };
  if (!preserveChannel) update.notes = appendDashboardAssignNotes(trip?.notes);
  return update;
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

export function buildAssignExistingTripUpdate({ trip, driver, assignedAt, originAddress } = {}) {
  const { lat, lng } = resolveAssignDriverGps(driver);
  const stamped = stampManualDashboardAssign({ trip, driverId: driver.id });
  const update = {
    driver_id: driver.id,
    status: 'pending',
    assigned_at: assignedAt,
    dispatch_status: 'waiting_acceptance',
    ...stamped,
  };

  if (!shouldPreservePickupOriginOnAssign(trip) && hasValidDriverGps({ current_lat: lat, current_lng: lng })) {
    const street = String(originAddress || '').trim();
    update.origin_address = street && !isCoordLikeAddress(street)
      ? street
      : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    update.origin_lat = lat;
    update.origin_lng = lng;
  }

  return update;
}
