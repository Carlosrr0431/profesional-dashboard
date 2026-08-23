const {
  shouldStartNewTrip,
  startFreshTripContext,
  pickTripForStatus,
  messagesToIntentHistory,
  statusQueryReplyForTrip,
} = require('../../src/lib/tripSession');
const types = require('../../data/whatsapp-trip-conversation-types.json');
const { classifyWhatsAppIncomingText } = require('../../src/lib/whatsappTripIntentPatterns');

describe('tripSession (estilo Multicarnes)', () => {
  it('no limpia contexto por viaje cerrado ni por pregunta de estado', () => {
    expect(shouldStartNewTrip({ intent: 'status_query' }, 'completed')).toBe(false);
    expect(shouldStartNewTrip({ intent: 'other' }, 'completed')).toBe(false);
    expect(shouldStartNewTrip({ intent: 'cancel_trip' }, 'pending')).toBe(false);
    expect(shouldStartNewTrip({ intent: 'price_inquiry' }, 'completed')).toBe(false);
  });

  it('limpia contexto solo con un viaje nuevo', () => {
    expect(shouldStartNewTrip({ intent: 'trip_request' }, 'completed')).toBe(true);
    expect(shouldStartNewTrip({ intent: 'trip_request', new_trip: true }, 'pending')).toBe(true);
    expect(shouldStartNewTrip({ intent: 'schedule_trip' }, 'completed')).toBe(true);
  });

  it('no resetea si hay viaje abierto o se está pidiendo altura/GPS', () => {
    expect(shouldStartNewTrip({ intent: 'trip_request' }, 'pending', {}, { hasOpenTrip: true })).toBe(false);
    expect(shouldStartNewTrip(
      { intent: 'trip_request' },
      null,
      { awaiting_pickup_number: true },
    )).toBe(false);
  });

  it('conserva nombre y viaje anterior al empezar uno nuevo', () => {
    const next = startFreshTripContext({
      passenger_name: 'Carlos',
      last_trip_id: 'trip-1',
      pickup_location: 'Mitre 200',
      already_greeted: true,
    });
    expect(next.passenger_name).toBe('Carlos');
    expect(next.previous_trip_id).toBe('trip-1');
    expect(next.pickup_location).toBeUndefined();
    expect(next.already_greeted).toBe(true);
  });

  it('elige el viaje abierto para status, o el último cerrado', () => {
    const open = { id: 'open', status: 'queued' };
    const closed = { id: 'done', status: 'completed' };
    expect(pickTripForStatus({ openTrip: open, lastClosedTrip: closed }).id).toBe('open');
    expect(pickTripForStatus({ lastClosedTrip: closed }).id).toBe('done');
  });

  it('arma historial desde whatsapp_messages sin repetir el mensaje actual', () => {
    const history = messagesToIntentHistory([
      { direction: 'incoming', content: 'Weño' },
      { direction: 'outgoing', content: 'Contame el viaje.' },
      { direction: 'incoming', content: 'mandame un movil a Mitre 200' },
    ], { pendingContents: ['mandame un movil a Mitre 200'] });
    expect(history).toEqual([
      { direction: 'incoming', content: 'Weño', transcription: undefined },
      { direction: 'outgoing', content: 'Contame el viaje.', transcription: undefined },
    ]);
  });

  it('responde status de un viaje cerrado sin pedir un viaje nuevo de más', () => {
    expect(statusQueryReplyForTrip({ status: 'completed' })).toMatch(/completado/i);
    expect(statusQueryReplyForTrip(null)).toMatch(/no tenés un viaje activo/i);
  });
});

describe('whatsapp-trip-conversation-types.json', () => {
  it('cubre los flujos que el chatbot debe sostener', () => {
    expect(types.table).toBe('whatsapp_messages');
    const ids = types.types.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([
      'greeting_typo',
      'small_talk_how_are_you',
      'direct_street_number',
      'status_while_open',
      'status_after_completed',
      'new_trip_after_completed',
    ]));
  });

  it('el último incoming de cada tipo encaja con el intent declarado', () => {
    const expectedHint = {
      greeting_typo: 'other',
      small_talk_how_are_you: 'other',
      direct_street_number: 'trip_request',
      street_without_number: 'trip_request',
      origin_and_destination: 'trip_request',
      price_inquiry_two_addresses: 'price_inquiry',
      guemes_poll: 'trip_request',
      status_while_open: 'status_query',
      status_after_completed: 'status_query',
      new_trip_after_completed: 'trip_request',
      cancel_open_trip: 'cancel_trip',
      scheduled_trip: 'schedule_trip',
      availability_without_address: 'other',
      ack_keep_context: 'other',
      gps_pin: 'other',
    };

    for (const type of types.types) {
      const lastIn = [...type.history].reverse().find((row) => row.direction === 'incoming');
      if (!lastIn?.content || lastIn.message_type === 'location' || lastIn.message_type === 'poll') continue;
      const classified = classifyWhatsAppIncomingText(lastIn.content);
      const hint = expectedHint[type.id];
      if (!hint) continue;
      expect({ id: type.id, hint: classified.intentHint }).toEqual({ id: type.id, hint });
    }
  });

  it('resetea contexto solo en tipos de viaje nuevo', () => {
    for (const type of types.types) {
      const classified = { intent: type.intent };
      const shouldReset = shouldStartNewTrip(classified, 'completed');
      expect({ id: type.id, shouldReset }).toEqual({
        id: type.id,
        shouldReset: Boolean(type.resets_context),
      });
    }
  });
});
