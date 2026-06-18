import {
  resolveScheduledDisplayFromTrip,
  resolveScheduledForFromTrip,
} from './promoteDueScheduledTrips';
import { resolveTripPickupCoords } from '../../shared/trip-contract.js';

export function scheduledDisplayLabelFromTrip(trip) {
  if (!trip) return null;
  const scheduledFor = resolveScheduledForFromTrip(trip);
  const label = resolveScheduledDisplayFromTrip(trip, scheduledFor);
  return label && label !== '—' ? label : null;
}

export function buildScheduledTripConfirmationReply({ displayText, pickupAddress, customReply }) {
  if (customReply) return customReply;
  return (
    `✅ ¡Reserva confirmada! Tu remis está agendado para el *${displayText}*.\n` +
    `Dirección de retiro: *${pickupAddress}*\n` +
    'Te avisamos cuando asignemos el chofer. Para cancelar, escribí *cancelar* y confirmá con *sí*.'
  );
}

export function buildOpenTripCancelConfirmMessage(trip) {
  const schedLabel =
    String(trip?.status || '').toLowerCase() === 'scheduled'
      ? scheduledDisplayLabelFromTrip(trip)
      : null;
  if (schedLabel) {
    return (
      `¿Confirmás que querés cancelar la reserva del *${schedLabel}*? ` +
      'Respondé *sí* para cancelar o *no* para mantenerla.'
    );
  }
  return '¿Confirmás que querés cancelar el viaje? Respondé *sí* para cancelar o *no* para mantener.';
}

export function buildOpenTripFastStatusMessage(trip) {
  const fastStatus = String(trip?.status || '').toLowerCase();
  const pickupAddress = resolveTripPickupCoords(trip)?.address;
  const retiroSuffix = pickupAddress ? `\nRetiro: *${pickupAddress}*` : '';

  if (fastStatus === 'queued') {
    return 'Ya estás en la cola de espera. Te avisamos en cuanto haya un chofer disponible 🕐';
  }
  if (fastStatus === 'pending') {
    return `Tu pedido ya está tomado, esperando confirmación del chofer.${retiroSuffix}`;
  }
  if (fastStatus === 'scheduled') {
    const label = scheduledDisplayLabelFromTrip(trip);
    const whenPart = label ? ` del *${label}*` : '';
    return (
      `Tenés una reserva agendada${whenPart}. Todavía no asignamos chofer. ` +
      'Para cancelar, escribí *cancelar*.'
    );
  }
  return `Ya tenés un móvil asignado. Tu viaje sigue en curso.${retiroSuffix}`;
}

export function buildOpenTripCancelDeniedMessage(trip) {
  const schedLabel =
    String(trip?.status || '').toLowerCase() === 'scheduled'
      ? scheduledDisplayLabelFromTrip(trip)
      : null;
  if (schedLabel) {
    return `Bueno, tu reserva del *${schedLabel}* sigue agendada. Avisame si necesitás algo más.`;
  }
  return 'Bueno, tu viaje sigue activo. Avisame si necesitás algo más.';
}

export function buildOpenTripCancelSuccessMessage(trip) {
  if (String(trip?.status || '').toLowerCase() === 'scheduled') {
    return 'Listo, cancelé tu reserva. Avisame cuando necesites otro móvil.';
  }
  return 'Listo, cancelé el pedido. Avisame cuando necesites otro móvil.';
}

export function buildScheduledStatusQueryReply(trip, extractedReply) {
  if (extractedReply) return extractedReply;
  const label = scheduledDisplayLabelFromTrip(trip);
  if (label) {
    return `Tu reserva del *${label}* está confirmada. Te avisamos cuando asignemos el chofer.`;
  }
  return 'Tu reserva está confirmada. Te avisamos cuando asignemos el chofer.';
}

export function buildQueuedStatusQueryReply(extractedReply) {
  return (
    extractedReply ||
    'Tu reserva ya está en cola para asignar chofer. Te avisamos en cuanto confirmemos.'
  );
}
