import {
  isOperatorInitiatedCancellation,
  isPassengerInitiatedCancellation,
} from './passengerTripCancel';
import { isStreetHailTrip } from '../../shared/trip-contract.js';
import { resolvePreferredDriverId } from './assignExistingTrip';
import { getActiveDispatchExcludedDriverIds } from './dispatchExclusions';

function normalizeReason(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWaContext(trip) {
  const raw = trip?.wa_context;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getWaContextSource(trip) {
  return String(getWaContext(trip)?.source || '').trim();
}

/** Viaje tomado en calle: no hay pasajero en cola ni WhatsApp que reasignar. */
export function isStreetHailReassignmentBlocked(trip) {
  if (!trip) return false;
  if (isStreetHailTrip(trip)) return true;
  return getWaContextSource(trip) === 'street_hail';
}

/**
 * El operador eligió un chofer concreto (Elegir chofer, ficha del mapa o Asignar chofer).
 * Si ese chofer rechaza o no contesta, el viaje vuelve a la cola
 * para que la operadora lo derive; el worker no busca otro automático.
 */
export function isDashboardAssignReassignmentBlocked(trip) {
  if (!trip) return false;
  const context = getWaContext(trip);
  if (context?.manual_assign === true) return true;
  if (getWaContextSource(trip) === 'dashboard_assign') return true;
  return String(trip.notes || '').toLowerCase().includes('[dashboard_assign]');
}

/**
 * Tras un rechazo/timeout, esperar a la operadora.
 * Si todavía no se ofreció al móvil elegido (p. ej. programado al vencer),
 * el worker puede asignar SOLO ese chofer, nunca al más cercano.
 */
export function shouldWaitForOperatorDispatch(trip) {
  if (!isDashboardAssignReassignmentBlocked(trip)) return false;
  const preferredDriverId = resolvePreferredDriverId(trip?.wa_context);
  if (!preferredDriverId) return true;
  return getActiveDispatchExcludedDriverIds(trip?.wa_context).includes(preferredDriverId);
}

/**
 * ¿El cron / scan debe crear otro viaje cuando este quedó cancelled?
 * Street hail, asignación manual del panel y cancelaciones de pasajero/operador nunca se clonan.
 */
export function shouldReassignCancelledTrip(trip, { supabaseDispatchOnly = true } = {}) {
  if (isStreetHailReassignmentBlocked(trip)) return false;
  if (isDashboardAssignReassignmentBlocked(trip)) return false;
  if (isPassengerInitiatedCancellation(trip)) return false;
  if (isOperatorInitiatedCancellation(trip)) return false;

  const reason = normalizeReason(trip?.cancel_reason || '');
  if (!reason) return true;

  const nonReassignableMarkers = [
    'pasajero cancelo',
    'cancelado por el pasajero',
    'cancelado por pasajero',
    'passenger app',
    'pasajero no encontrado',
    'direccion incorrecta',
  ];
  if (nonReassignableMarkers.some((marker) => reason.includes(marker))) {
    return false;
  }

  if (
    supabaseDispatchOnly
    && (
      reason.includes('auto timeout')
      || reason.includes('no acepto en tiempo')
      || reason.includes('no aceptado en tiempo')
      || reason.includes('sin respuesta del chofer')
      || reason.includes('auto reasignacion')
      || reason.includes('auto requeue')
    )
  ) {
    return false;
  }

  return true;
}
