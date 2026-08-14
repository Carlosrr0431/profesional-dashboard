const {
  BETTO_INTRO,
  BETTO_GREETING_TTL_MS,
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

  it('persiste el saludo 30 minutos aunque se resetee la sesión', () => {
    const now = Date.parse('2026-08-12T22:20:00-03:00');
    const stamped = stampBettoGreeted(new Date(now));
    expect(isBettoGreetedContext(stamped, now)).toBe(true);
    expect(isBettoGreetedContext(stamped, now + BETTO_GREETING_TTL_MS - 1000)).toBe(true);
    expect(isBettoGreetedContext(stamped, now + BETTO_GREETING_TTL_MS + 1000)).toBe(false);

    const kept = mergeWhatsappSessionContext(
      { ...stamped, wasender_line: '5493872138777' },
      {},
      { now },
    );
    expect(kept.betto_greeted).toBe(true);
    expect(kept.betto_greeted_at).toBe(stamped.betto_greeted_at);

    const resetWithinWindow = mergeWhatsappSessionContext(
      stamped,
      {},
      { sessionReset: true, now: now + 60 * 1000 },
    );
    expect(resetWithinWindow.betto_greeted).toBe(true);
    expect(resetWithinWindow.betto_greeted_at).toBe(stamped.betto_greeted_at);

    const resetAfterTtl = mergeWhatsappSessionContext(
      stamped,
      {},
      { sessionReset: true, now: now + BETTO_GREETING_TTL_MS + 1000 },
    );
    expect(resetAfterTtl.betto_greeted).toBeUndefined();
    expect(resetAfterTtl.betto_greeted_at).toBeUndefined();
  });

  it('no corre la ventana si este turno vuelve a marcar el saludo', () => {
    const now = Date.parse('2026-08-12T22:20:00-03:00');
    const prev = stampBettoGreeted(new Date(now));
    const merged = mergeWhatsappSessionContext(
      prev,
      stampBettoGreeted(new Date(now + 60 * 1000)),
      { sessionReset: true, now: now + 60 * 1000 },
    );
    expect(merged.betto_greeted_at).toBe(prev.betto_greeted_at);
  });

  it('no trata betto_greeted sin timestamp como saludo eterno', () => {
    const now = Date.parse('2026-08-13T22:31:00-03:00');
    expect(isBettoGreetedContext({ betto_greeted: true }, now)).toBe(false);
    expect(isBettoGreetedContext({ betto_greeted: true, betto_greeted_at: null }, now)).toBe(false);
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
