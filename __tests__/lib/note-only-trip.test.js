const { placeLabelMatchesQuery } = require('../../shared/salta-address');
const {
  NOTE_ONLY_MARKER,
  buildNoteOnlyQueuedTrip,
  buildWhatsAppNoteOnlyQueuedTrip,
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

  it('juan pablo segundo colectora 3 no es la calle Juan Pablo Segundo', () => {
    expect(placeLabelMatchesQuery(
      'juan pablo segundo colectora 3',
      'Juan Pablo Segundo, C. Fernandes Molinas',
    )).toBe(false);
    expect(placeLabelMatchesQuery(
      'paseo guemes 50',
      'P.º Güemes 50, Salta',
    )).toBe(true);
    expect(placeLabelMatchesQuery(
      'mitre 300',
      'Bartolomé Mitre 300, Salta',
    )).toBe(true);
  });

  it('arma la nota de WhatsApp con el texto entendido y sin pin de retiro', () => {
    const trip = buildWhatsAppNoteOnlyQueuedTrip({
      notes: 'juan pablo segundo colectora 3',
      passengerName: 'Carlos',
      passengerPhone: '5493878630173',
    });
    expect(trip.origin_address).toBe('juan pablo segundo colectora 3');
    expect(trip.notes).toContain(NOTE_ONLY_MARKER);
    expect(trip.notes).toContain('juan pablo segundo colectora 3');
    expect(trip.destination_address).toBeNull();
    expect(isNoteOnlyTrip(trip)).toBe(true);
  });
});
