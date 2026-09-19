import { CLOSED_TRIP_STATUSES } from './tripSession';
import {
  replaceHumanTripNotes,
} from '../../shared/trip-contract.js';

export const OPERATOR_NOTES_TRIP_SELECT = [
  'id',
  'status',
  'notes',
  'passenger_name',
].join(', ');

function notesError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function canOperatorEditTripNotes(trip) {
  const status = String(trip?.status || '').toLowerCase();
  return Boolean(trip?.id) && !CLOSED_TRIP_STATUSES.includes(status);
}

export async function updateTripNotesAsOperator(supabase, tripId, humanNotes) {
  const id = String(tripId || '').trim();
  if (!id) {
    throw notesError('Falta el viaje.', 'missing_trip_id');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('trips')
    .select(OPERATOR_NOTES_TRIP_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) {
    throw notesError('Viaje no encontrado.', 'trip_not_found');
  }

  if (!canOperatorEditTripNotes(existing)) {
    throw notesError(
      'Este viaje ya no admite cambios de notas.',
      'not_editable',
    );
  }

  const nextNotes = replaceHumanTripNotes(existing.notes, humanNotes);
  if ((existing.notes || null) === nextNotes) {
    return { trip: existing, unchanged: true };
  }

  const { data: trip, error: updateError } = await supabase
    .from('trips')
    .update({ notes: nextNotes })
    .eq('id', id)
    .select(OPERATOR_NOTES_TRIP_SELECT)
    .maybeSingle();

  if (updateError) throw updateError;
  if (!trip) {
    throw notesError('No se pudieron guardar las notas.', 'update_failed');
  }

  return { trip, unchanged: false };
}
