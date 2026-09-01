import { isPassengerAppTrip } from '../../shared/trip-contract.js';
import {
  OPERATOR_CANCELLABLE_STATUSES,
  buildOperatorCancelledTripUpdate,
} from './passengerTripCancel';

export const OPERATOR_CANCEL_TRIP_SELECT = [
  'id',
  'status',
  'cancel_reason',
  'driver_id',
  'passenger_name',
  'passenger_phone',
  'origin_address',
  'destination_address',
  'notes',
  'wa_context',
  'dispatch_status',
].join(', ');

function operatorCancelError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export async function cancelTripAsOperator(supabase, tripId) {
  const id = String(tripId || '').trim();
  if (!id) {
    throw operatorCancelError('Falta el viaje a cancelar.', 'missing_trip_id');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('trips')
    .select(OPERATOR_CANCEL_TRIP_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) {
    throw operatorCancelError('Viaje no encontrado.', 'trip_not_found');
  }

  const status = String(existing.status || '').toLowerCase();
  if (status === 'cancelled') {
    return { trip: existing, alreadyCancelled: true };
  }

  if (!OPERATOR_CANCELLABLE_STATUSES.includes(status)) {
    throw operatorCancelError(
      'Este viaje ya no se puede cancelar desde acá (fue asignado o cancelado).',
      'not_cancellable',
    );
  }

  const { data: trip, error: updateError } = await supabase
    .from('trips')
    .update(buildOperatorCancelledTripUpdate(existing))
    .eq('id', id)
    .in('status', OPERATOR_CANCELLABLE_STATUSES)
    .select(OPERATOR_CANCEL_TRIP_SELECT)
    .maybeSingle();

  if (updateError) throw updateError;

  if (!trip) {
    const { data: refreshed } = await supabase
      .from('trips')
      .select(OPERATOR_CANCEL_TRIP_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (String(refreshed?.status || '').toLowerCase() === 'cancelled') {
      return { trip: refreshed, alreadyCancelled: true };
    }

    throw operatorCancelError(
      'El viaje cambió de estado y ya no se puede cancelar.',
      'not_cancellable',
    );
  }

  const { error: queueError } = await supabase
    .from('dispatch_queue')
    .delete()
    .eq('trip_id', id);

  if (queueError) {
    console.error('[cancelTripAsOperator] dispatch_queue', queueError);
  }

  return { trip, alreadyCancelled: false };
}
