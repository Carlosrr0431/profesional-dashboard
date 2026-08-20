const {
  BETTO_INTRO,
  buildBettoWelcomeMessage,
  withBettoIntro,
  isBettoGreetedContext,
  isAvailabilityAskWithoutRoute,
  shouldSendBettoWelcome,
  stampBettoGreeted,
  mergeWhatsappSessionContext,
} = require('../../src/lib/bettoWelcome');

describe('bettoWelcome', () => {
  it('arma la bienvenida con el nombre del bot', () => {
    const msg = buildBettoWelcomeMessage();
    expect(msg.startsWith(BETTO_INTRO)).toBe(true);
    expect(msg).toMatch(/calle y altura/i);
    expect(msg).toMatch(/ubicaci[oó]n GPS/i);
    expect(msg).not.toMatch(/referencia/i);
  });

  it('antepone el saludo una sola vez', () => {
    const body = 'Tomé tu pedido y ya lo derivé.';
    const once = withBettoIntro(body);
    expect(once).toBe(`${BETTO_INTRO}\n\n${body}`);
    expect(withBettoIntro(once)).toBe(once);
  });

  it('no duplica un Hola del modelo si Betto ya saludó', () => {
    const once = withBettoIntro(
      'Hola Carlos, ¿de dónde te buscamos? Pasame la calle y el número.',
    );
    expect(once.startsWith(BETTO_INTRO)).toBe(true);
    expect(once).not.toMatch(/Hola Carlos/i);
    expect(once.split(/hola/i).length - 1).toBe(1);
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
