const {
  buildBettoWelcomeMessage,
  conversationalGreeting,
  extractMirroredGreeting,
  withBettoIntro,
  isBettoGreetedContext,
  isAvailabilityAskWithoutRoute,
  shouldSendBettoWelcome,
  stampBettoGreeted,
  mergeWhatsappSessionContext,
} = require('../../src/lib/bettoWelcome');

const morning = new Date('2026-08-25T10:00:00-03:00');
const afternoon = new Date('2026-08-25T15:41:00-03:00');
const night = new Date('2026-08-25T21:30:00-03:00');

describe('bettoWelcome', () => {
  it('arma la bienvenida con saludo según la hora de Salta', () => {
    const msg = buildBettoWelcomeMessage({ now: morning });
    expect(msg.startsWith('Buen día 👋')).toBe(true);
    expect(msg).toMatch(/Soy Betto/i);
    expect(msg).toMatch(/calle y altura/i);
    expect(msg).toMatch(/ubicaci[oó]n GPS/i);
    expect(msg).not.toMatch(/referencia/i);
  });

  it('espeja el saludo del pasajero en un pedido nuevo', () => {
    expect(extractMirroredGreeting('Buen día me podría enviar un móvil')).toBe('Buen día');
    expect(conversationalGreeting({
      text: 'Buen día me podría enviar un móvil con baulera al Vélez Sarfield 105',
      now: afternoon,
    })).toBe('Buen día');
    expect(conversationalGreeting({ text: 'me podría enviar un móvil', now: afternoon })).toBe('Buenas tardes');
    expect(conversationalGreeting({ text: 'hola, tenes movil', now: night })).toBe('Hola');
  });

  it('antepone el saludo una sola vez', () => {
    const body = 'Dale, te tomo el móvil.';
    const once = withBettoIntro(body, { now: afternoon });
    expect(once).toBe(`Buenas tardes 👋\n\n${body}`);
    expect(withBettoIntro(once, { now: afternoon })).toBe(once);
  });

  it('no duplica un Hola del modelo si Betto ya saludó', () => {
    const once = withBettoIntro(
      'Hola Carlos, ¿de dónde te buscamos? Pasame la calle y el número.',
      { now: morning },
    );
    expect(once.startsWith('Buen día 👋')).toBe(true);
    expect(once).not.toMatch(/Hola Carlos/i);
  });

  it('detecta "hola, tenes movil" sin dirección', () => {
    expect(isAvailabilityAskWithoutRoute('hola, tenes movil')).toBe(true);
    expect(isAvailabilityAskWithoutRoute('hay remis?')).toBe(true);
    expect(isAvailabilityAskWithoutRoute('tienen movil')).toBe(true);
    expect(isAvailabilityAskWithoutRoute('me podes mandar un auto a mitre al 200')).toBe(false);
  });

  it('manda bienvenida en saludo o pedido sin ruta', () => {
    expect(shouldSendBettoWelcome({
      text: 'hola',
      intent: 'other',
      hasConcreteAddress: false,
      looksLikeTripRequest: false,
    })).toBe(true);

    expect(shouldSendBettoWelcome({
      text: 'hola, tenes movil',
      intent: 'trip_request',
      hasConcreteAddress: false,
      looksLikeTripRequest: true,
    })).toBe(true);

    expect(shouldSendBettoWelcome({
      text: 'tienen movil',
      intent: 'other',
      hasConcreteAddress: false,
      looksLikeTripRequest: false,
    })).toBe(true);

    expect(shouldSendBettoWelcome({
      text: 'gracias',
      intent: 'other',
      hasConcreteAddress: false,
      looksLikeTripRequest: false,
    })).toBe(false);

    expect(shouldSendBettoWelcome({
      text: 'me podes mandar un auto a mitre al 200',
      intent: 'trip_request',
      hasConcreteAddress: true,
      looksLikeTripRequest: true,
    })).toBe(false);
  });

  it('no pisa cancelar / estado / precio / reserva', () => {
    expect(shouldSendBettoWelcome({
      text: 'cancelar',
      intent: 'cancel_trip',
      hasConcreteAddress: false,
    })).toBe(false);
    expect(shouldSendBettoWelcome({
      text: 'donde esta el chofer',
      intent: 'status_query',
      hasConcreteAddress: false,
    })).toBe(false);
  });

  it('el flag de saludo no caduca por el tiempo', () => {
    const now = Date.parse('2026-08-12T22:20:00-03:00');
    const stamped = stampBettoGreeted(new Date(now));
    expect(isBettoGreetedContext(stamped)).toBe(true);
    expect(isBettoGreetedContext({ betto_greeted: true })).toBe(true);
    expect(isBettoGreetedContext({ betto_greeted: true, betto_greeted_at: null })).toBe(true);
    expect(isBettoGreetedContext({})).toBe(false);

    const kept = mergeWhatsappSessionContext(
      { ...stamped, wasender_line: '5493872138777' },
      {},
      { now: now + 3 * 60 * 60 * 1000 },
    );
    expect(kept.betto_greeted).toBe(true);
    expect(kept.betto_greeted_at).toBe(stamped.betto_greeted_at);
  });

  it('un viaje nuevo limpia el saludo previo', () => {
    const now = Date.parse('2026-08-12T22:20:00-03:00');
    const stamped = stampBettoGreeted(new Date(now));
    const cleared = mergeWhatsappSessionContext(stamped, {}, { sessionReset: true, now });
    expect(cleared.betto_greeted).toBeUndefined();
    expect(cleared.betto_greeted_at).toBeUndefined();

    const restampedAt = now + 60 * 1000;
    const restamped = mergeWhatsappSessionContext(
      stamped,
      stampBettoGreeted(new Date(restampedAt)),
      { sessionReset: true, now: restampedAt },
    );
    expect(restamped.betto_greeted).toBe(true);
    expect(restamped.betto_greeted_at).toBe(new Date(restampedAt).toISOString());
  });

  it('reemplaza pedidos de retiro vagos por calle y altura o GPS', () => {
    const { rewriteVaguePickupAsk, ASK_PICKUP_STREET_OR_GPS } = require('../../src/lib/bettoWelcome');
    expect(rewriteVaguePickupAsk(
      'Hola Carlos, ¿me pasás la calle y número o una referencia para buscarte?',
    )).toBe(ASK_PICKUP_STREET_OR_GPS);
    expect(rewriteVaguePickupAsk(
      'Hola Carlos, ¿de dónde te buscamos? Pasame la calle y el número.',
    )).toBe(ASK_PICKUP_STREET_OR_GPS);
    expect(rewriteVaguePickupAsk('Mandame una referencia')).toBe(ASK_PICKUP_STREET_OR_GPS);
    expect(rewriteVaguePickupAsk(ASK_PICKUP_STREET_OR_GPS)).toBe(ASK_PICKUP_STREET_OR_GPS);
  });
});
