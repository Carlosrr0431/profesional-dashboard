import {
  isOperatorInitiatedCancellation,
  isPassengerInitiatedCancellation,
} from './passengerTripCancel';
import { isStreetHailTrip } from '../../shared/trip-contract.js';

function normalizeReason(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWaContextSource(trip) {
  const raw = trip?.wa_context;
  if (!raw) return '';
  if (typeof raw === 'object') return String(raw.source || '').trim();
  if (typeof raw !== 'string') return '';
  try {
    return String(JSON.parse(raw)?.source || '').trim();
  } catch {
    return '';
  }
}

/** Viaje tomado en calle: no hay pasajero en cola ni WhatsApp que reasignar. */
export function isStreetHailReassignmentBlocked(trip) {
  if (!trip) return false;
  if (isStreetHailTrip(trip)) return true;
  return getWaContextSource(trip) === 'street_hail';
}

/**
 * ¿El cron / scan debe crear otro viaje cuando este quedó cancelled?
 * Street hail y cancelaciones de pasajero/operador nunca se clonan.
 */
export function shouldReassignCancelledTrip(trip, { supabaseDispatchOnly = true } = {}) {
  if (isStreetHailReassignmentBlocked(trip)) return false;
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
