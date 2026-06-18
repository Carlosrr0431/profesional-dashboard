const {
  getPassengerTripPushContent,
  getPassengerPushSentStatuses,
  buildPassengerPushWaContext,
  resolvePassengerPushStatus,
  PASSENGER_PUSHABLE_STATUSES,
} = require('../../src/lib/passengerPushNotifications');

describe('passengerPushNotifications', () => {
  it('define mensajes en español para estados clave', () => {
    const accepted = getPassengerTripPushContent('going_to_pickup', { driverName: 'Juan Pérez' });
    expect(accepted.title).toMatch(/conductor/i);
    expect(accepted.body).toContain('Juan Pérez');
    expect(PASSENGER_PUSHABLE_STATUSES).toContain('pending');
    expect(PASSENGER_PUSHABLE_STATUSES).toContain('cancelled');
  });

  it('registra estados push enviados en wa_context', () => {
    const next = buildPassengerPushWaContext({ foo: 'bar' }, 'pending');
    expect(getPassengerPushSentStatuses(next).has('pending')).toBe(true);
    expect(next.foo).toBe('bar');

    const again = buildPassengerPushWaContext(next, 'going_to_pickup');
    const sent = getPassengerPushSentStatuses(again);
    expect(sent.has('pending')).toBe(true);
    expect(sent.has('going_to_pickup')).toBe(true);
  });

  it('mapea going_to_pickup a accepted cuando el chofer acepta sin estado intermedio', () => {
    const trip = {
      status: 'going_to_pickup',
      wa_context: {},
    };

    expect(resolvePassengerPushStatus(trip)).toBe('accepted');

    const afterAccepted = {
      ...trip,
      wa_context: buildPassengerPushWaContext({}, 'accepted'),
    };
    expect(resolvePassengerPushStatus(afterAccepted)).toBeNull();
  });

  it('envía pending solo si aún no se notificó', () => {
    const trip = { status: 'pending', wa_context: {} };
    expect(resolvePassengerPushStatus(trip)).toBe('pending');

    const sent = {
      status: 'pending',
      wa_context: buildPassengerPushWaContext({}, 'pending'),
    };
    expect(resolvePassengerPushStatus(sent)).toBeNull();
  });
});
