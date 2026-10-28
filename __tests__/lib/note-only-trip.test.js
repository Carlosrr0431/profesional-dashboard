const {
  NOTE_ONLY_MARKER,
  buildNoteOnlyQueuedTrip,
  isNoteOnlyTrip,
} = require('../../src/lib/noteOnlyTrip');

describe('noteOnlyTrip', () => {
  it('arma un viaje en cola con la nota y sin destino', () => {
    const trip = buildNoteOnlyQueuedTrip({
      notes: 'Barrio Castañares manzana 14 casi 21 familia Rodriguez',
    });
    expect(trip.status).toBe('queued');
    expect(trip.destination_address).toBeNull();
    expect(trip.destination_lat).toBeNull();
    expect(trip.origin_address).toMatch(/Castañares/);
    expect(trip.notes).toContain(NOTE_ONLY_MARKER);
    expect(trip.notes).toContain('[FREE_RIDE]');
    expect(trip.notes).toContain('familia Rodriguez');
    expect(isNoteOnlyTrip(trip)).toBe(true);
  });

  it('rechaza una nota vacía', () => {
    expect(() => buildNoteOnlyQueuedTrip({ notes: '   ' })).toThrow(/nota/i);
  });
});
