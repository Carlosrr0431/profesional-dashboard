/** @jest-environment node */

import {
  canOperatorEditTripNotes,
  updateTripNotesAsOperator,
} from '../../src/lib/updateTripNotesAsOperator';
import {
  cleanTripNotesForDriverDisplay,
  notesContainPickupJson,
} from '../../shared/trip-contract';

const EXISTING_NOTES = [
  '[APPROACH_ONLY]',
  '[PASSENGER_APP]',
  'Solicitado desde la app de pasajeros.',
  'Portón negro.',
  '[PICKUP_JSON:{"address":"Mitre 100, Salta","lat":-24.79,"lng":-65.41}]',
].join('\n');

function createNotesSupabase({ existing, updated, fetchError = null, updateError = null }) {
  const maybeSingle = jest.fn()
    .mockResolvedValueOnce({ data: existing, error: fetchError })
    .mockResolvedValueOnce({ data: updated, error: updateError });
  const builder = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle,
  };
  return {
    from: jest.fn(() => builder),
    builder,
  };
}

describe('updateTripNotesAsOperator', () => {
  it('rechaza viajes cerrados', () => {
    expect(canOperatorEditTripNotes({ id: 't1', status: 'completed' })).toBe(false);
    expect(canOperatorEditTripNotes({ id: 't1', status: 'cancelled' })).toBe(false);
    expect(canOperatorEditTripNotes({ id: 't1', status: 'in_progress' })).toBe(true);
    expect(canOperatorEditTripNotes({ id: 't1', status: 'queued' })).toBe(true);
    expect(canOperatorEditTripNotes({ id: 't1', status: 'scheduled' })).toBe(true);
  });

  it('conserva tags de un viaje programado al editar la nota humana', async () => {
    const existing = {
      id: 'trip-sch',
      status: 'scheduled',
      notes: [
        '[SCHEDULED_FOR] 2026-09-19T12:00:00.000Z',
        '[SCHEDULED_DISPLAY] sáb 19:00',
        'Portón negro',
      ].join('\n'),
    };
    const supabase = createNotesSupabase({
      existing,
      updated: { ...existing, notes: 'placeholder' },
    });

    await updateTripNotesAsOperator(supabase, 'trip-sch', 'Esperar en la esquina');

    const payload = supabase.builder.update.mock.calls[0][0];
    expect(payload.notes).toContain('[SCHEDULED_FOR] 2026-09-19T12:00:00.000Z');
    expect(payload.notes).toContain('[SCHEDULED_DISPLAY] sáb 19:00');
    expect(cleanTripNotesForDriverDisplay(payload.notes)).toBe('Esperar en la esquina');
  });

  it('conserva marcadores y cambia el texto del chofer', async () => {
    const existing = {
      id: 'trip-1',
      status: 'going_to_pickup',
      notes: EXISTING_NOTES,
      passenger_name: 'Ana',
    };
    const supabase = createNotesSupabase({
      existing,
      updated: { ...existing, notes: 'placeholder' },
    });

    await updateTripNotesAsOperator(supabase, 'trip-1', 'Esperar en la esquina');

    const payload = supabase.builder.update.mock.calls[0][0];
    expect(cleanTripNotesForDriverDisplay(payload.notes)).toBe('Esperar en la esquina');
    expect(notesContainPickupJson(payload.notes)).toBe(true);
    expect(payload.notes).toContain('[APPROACH_ONLY]');
    expect(payload.notes).toContain('[PASSENGER_APP]');
    expect(payload.notes).not.toContain('Portón negro');
  });

  it('no escribe si el texto no cambió', async () => {
    const existing = {
      id: 'trip-1',
      status: 'queued',
      notes: EXISTING_NOTES,
    };
    const supabase = createNotesSupabase({ existing, updated: existing });
    const result = await updateTripNotesAsOperator(supabase, 'trip-1', 'Portón negro.');
    expect(result.unchanged).toBe(true);
    expect(supabase.builder.update).not.toHaveBeenCalled();
  });

  it('rechaza un viaje cancelado', async () => {
    const supabase = createNotesSupabase({
      existing: { id: 'trip-1', status: 'cancelled', notes: EXISTING_NOTES },
      updated: null,
    });
    await expect(updateTripNotesAsOperator(supabase, 'trip-1', 'Hola'))
      .rejects.toMatchObject({ code: 'not_editable' });
  });
});
