const {
  BETTO_INTRO,
  buildBettoWelcomeMessage,
  withBettoIntro,
  isBettoGreetedContext,
  isAvailabilityAskWithoutRoute,
  shouldSendBettoWelcome,
  mergeWhatsappSessionContext,
} = require('../../src/lib/bettoWelcome');

describe('bettoWelcome', () => {
  it('arma la bienvenida con el nombre del bot', () => {
    const msg = buildBettoWelcomeMessage();
    expect(msg.startsWith(BETTO_INTRO)).toBe(true);
    expect(msg).toMatch(/de dónde te buscamos/i);
    expect(msg).toMatch(/a dónde vas/i);
  });

  it('antepone el saludo una sola vez', () => {
    const body = 'Tomé tu pedido y ya lo derivé.';
    const once = withBettoIntro(body);
    expect(once).toBe(`${BETTO_INTRO}\n\n${body}`);
    expect(withBettoIntro(once)).toBe(once);
  });

  it('detecta "hola, tenes movil" sin dirección', () => {
    expect(isAvailabilityAskWithoutRoute('hola, tenes movil')).toBe(true);
    expect(isAvailabilityAskWithoutRoute('hay remis?')).toBe(true);
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

  it('persiste betto_greeted entre turnos y lo limpia al resetear sesión', () => {
    expect(isBettoGreetedContext({ betto_greeted: true })).toBe(true);
    const kept = mergeWhatsappSessionContext(
      { betto_greeted: true, wasender_line: '5493872138777' },
      {},
    );
    expect(kept.betto_greeted).toBe(true);

    const reset = mergeWhatsappSessionContext(
      { betto_greeted: true },
      {},
      { sessionReset: true },
    );
    expect(reset.betto_greeted).toBeUndefined();

    const greetedThisTurn = mergeWhatsappSessionContext(
      { betto_greeted: true },
      { betto_greeted: true },
      { sessionReset: true },
    );
    expect(greetedThisTurn.betto_greeted).toBe(true);
  });
});
