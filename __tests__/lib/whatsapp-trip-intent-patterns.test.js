import {
  buildPatternTripExtraction,
  classifyWhatsAppIncomingText,
  isAvailabilityAskWithoutRoute,
  looksLikeFreshTripRequest,
  looksLikePriceInquiry,
  looksLikeTripRequest,
  parseOriginDestinationPair,
  shouldPreservePriceQuoteAfterTripReset,
  shouldUsePatternExtraction,
} from '../../src/lib/whatsappTripIntentPatterns';

describe('whatsappTripIntentPatterns', () => {
  it('detecta pedido explícito de remis', () => {
    const result = classifyWhatsAppIncomingText('necesito un remis para belgrano al 200');
    expect(result.intentHint).toBe('trip_request');
  });

  it('detecta saludo como other', () => {
    const result = classifyWhatsAppIncomingText('hola');
    expect(result.intentHint).toBe('other');
  });

  it('trata Weño y Cómo estás como charla, no como viaje', () => {
    expect(classifyWhatsAppIncomingText('Weño').intentHint).toBe('other');
    expect(classifyWhatsAppIncomingText('Cómo estás?').intentHint).toBe('other');
  });

  it('detecta demora y por dónde viene como status_query', () => {
    expect(classifyWhatsAppIncomingText('Demora?').intentHint).toBe('status_query');
    expect(classifyWhatsAppIncomingText('Por donde viene?').intentHint).toBe('status_query');
    expect(classifyWhatsAppIncomingText('cuanto tarda el chofer?').intentHint).toBe('status_query');
  });

  it('resuelve trip_request por patrón sin LLM', () => {
    const extraction = buildPatternTripExtraction({
      combinedText: 'mandame un movil para españa al 300',
      pushName: 'Juan',
      heuristics: {
        looksLikeTripRequest: true,
        pickup: 'España 300, Salta',
        destination: null,
      },
    });
    expect(extraction.intent).toBe('trip_request');
    expect(shouldUsePatternExtraction(extraction)).toBe(true);
  });

  it('resuelve trip_request por patrón sin LLM para "me mandas un remis a ..."', () => {
    const extraction = buildPatternTripExtraction({
      combinedText: 'hola, me mandas un remis a guemes al 200',
      pushName: 'Juan',
      heuristics: {
        looksLikeTripRequest: true,
        pickup: 'guemes al 200',
        destination: null,
      },
    });
    expect(extraction.intent).toBe('trip_request');
    expect(extraction.pickup_location).toBe('guemes al 200');
    expect(shouldUsePatternExtraction(extraction)).toBe(true);
  });

  it('detecta "me mandas un remis" como pedido de viaje', () => {
    expect(looksLikeTripRequest('hola, me mandas un remis a guemes al 200')).toBe(true);
  });

  it('no fuerza trip_request sin señal de transporte', () => {
    expect(looksLikeTripRequest('voy en colectivo')).toBe(false);
    const extraction = buildPatternTripExtraction({
      combinedText: 'voy en colectivo',
      heuristics: { looksLikeTripRequest: false, pickup: null, destination: null },
    });
    expect(extraction.intent).toBe('other');
    expect(shouldUsePatternExtraction(extraction)).toBe(false);
  });

  it('no trata un número de altura como acknowledgment', () => {
    expect(classifyWhatsAppIncomingText('300').category).toBe('address_reply');
    expect(classifyWhatsAppIncomingText('ok').category).toBe('acknowledgment');
  });

  it('no trata "tienen movil" / "hay remis" como pedido de viaje ni como calle', () => {
    expect(isAvailabilityAskWithoutRoute('tienen movil')).toBe(true);
    expect(isAvailabilityAskWithoutRoute('hay remis')).toBe(true);
    expect(isAvailabilityAskWithoutRoute('tenes movil')).toBe(true);
    expect(looksLikeTripRequest('tienen movil')).toBe(false);
    expect(looksLikeTripRequest('hay remis?')).toBe(false);
    expect(looksLikeTripRequest('mandame un móvil a Mitre 200')).toBe(true);

    const classified = classifyWhatsAppIncomingText('tienen movil');
    expect(classified.category).toBe('availability_ask');
    expect(classified.intentHint).toBe('other');

    const extraction = buildPatternTripExtraction({
      combinedText: 'tienen movil',
      heuristics: {
        looksLikeTripRequest: true,
        pickup: 'tienen',
        destination: null,
      },
    });
    expect(extraction.intent).toBe('other');
    expect(extraction.pickup_location).toBeNull();
  });

  it('detecta cotización aunque no traiga de/hasta en la misma frase', () => {
    expect(looksLikePriceInquiry('queria saber el precio de un viaje')).toBe(true);
    expect(looksLikePriceInquiry('cuanto sale')).toBe(true);
    expect(looksLikePriceInquiry('me das una cotizacion')).toBe(true);
    expect(looksLikePriceInquiry('cuanto falta')).toBe(false);
    expect(classifyWhatsAppIncomingText('queria saber el precio de un viaje').intentHint).toBe('price_inquiry');
  });

  it('pide origen y destino en una cotización, sin despachar', () => {
    const first = buildPatternTripExtraction({
      combinedText: 'queria saber el precio de un viaje',
      heuristics: { pickup: null, destination: null, looksLikeTripRequest: true },
    });
    expect(first.intent).toBe('price_inquiry');
    expect(first.missing_fields).toEqual(expect.arrayContaining(['pickup_location', 'destination']));
    expect(shouldUsePatternExtraction(first)).toBe(true);

    const afterOrigin = buildPatternTripExtraction({
      combinedText: 'mitre 200',
      context: {
        price_inquiry: true,
        awaiting_price_origin: true,
        pickup_location: null,
        origin: null,
      },
      heuristics: { pickup: null, destination: null, looksLikeTripRequest: false },
    });
    expect(afterOrigin.intent).toBe('price_inquiry');
    expect(afterOrigin.pickup_location).toMatch(/mitre 200/i);
    expect(afterOrigin.destination).toBeNull();
    expect(afterOrigin.missing_fields).toContain('destination');
  });

  it('si en el origen mandan origen y destino juntos, cotiza sin volver a preguntar', () => {
    expect(parseOriginDestinationPair('mitre 200 a guemes 400')).toEqual({
      pickup: 'mitre 200',
      destination: 'guemes 400',
    });
    expect(parseOriginDestinationPair('de mitre 200 a guemes 400')?.destination).toMatch(/guemes 400/i);
    expect(parseOriginDestinationPair('mitre 200 para ir a guemes 400')?.destination).toMatch(/guemes 400/i);
    expect(parseOriginDestinationPair('mitre 200')).toBeNull();
    expect(parseOriginDestinationPair('mitre 200 a las 8')).toBeNull();

    const extraction = buildPatternTripExtraction({
      combinedText: 'mitre 200 a guemes 400',
      context: {
        price_inquiry: true,
        awaiting_price_origin: true,
      },
      heuristics: { pickup: null, destination: null, looksLikeTripRequest: false },
    });
    expect(extraction.intent).toBe('price_inquiry');
    expect(extraction.pickup_location).toMatch(/mitre 200/i);
    expect(extraction.destination).toMatch(/guemes 400/i);
    expect(extraction.missing_fields).toEqual([]);
  });

  it('completa el destino de una cotización si el bot acaba de pedirlo', () => {
    const extraction = buildPatternTripExtraction({
      combinedText: 'guemes 400',
      context: {
        price_inquiry: true,
        awaiting_price_destination: true,
        pickup_location: 'Mitre 200',
        origin: 'Mitre 200',
      },
      heuristics: { pickup: null, destination: null, looksLikeTripRequest: false },
    });
    expect(extraction.intent).toBe('price_inquiry');
    expect(extraction.pickup_location).toBe('Mitre 200');
    expect(extraction.destination).toMatch(/guemes 400/i);
    expect(extraction.missing_fields).toEqual([]);
  });

  it('no trata una dirección de cotización como pedido de móvil', () => {
    const extraction = buildPatternTripExtraction({
      combinedText: 'mitre 200',
      context: { last_bot_reply: 'Para darte el precio necesito las dos direcciones. ¿Cuál es el *origen* del viaje? (calle y número)' },
      heuristics: { pickup: null, destination: null, looksLikeTripRequest: false },
    });
    expect(extraction.intent).toBe('price_inquiry');
    expect(extraction.intent).not.toBe('trip_request');
    expect(extraction.pickup_location).toMatch(/mitre 200/i);
    expect(extraction.missing_fields).toContain('destination');
  });

  it('no toma el ejemplo Mitre 200 del saludo como origen de una cotización', () => {
    const extraction = buildPatternTripExtraction({
      combinedText: 'quiero saber el precio deu n viaje',
      context: {
        last_bot_reply: 'Contame el viaje que querés tomar. Necesito de dónde te buscamos. Ejemplo: Mitre 200 o buscame en Mitre 200 para ir a Güemes 400.',
      },
      heuristics: { pickup: 'Mitre 200', destination: null, looksLikeTripRequest: true },
    });
    expect(extraction.intent).toBe('price_inquiry');
    expect(extraction.pickup_location).toBeNull();
    expect(extraction.missing_fields).toEqual(expect.arrayContaining(['pickup_location', 'destination']));
    expect(extraction.reply).toMatch(/origen/i);
  });

  it('detecta un pedido fresco de móvil aunque haya cola abierta', () => {
    expect(looksLikeFreshTripRequest(
      'Buen día me podría enviar un móvil con baulera al Vélez Sarfield 105',
    )).toBe(true);
    expect(looksLikeFreshTripRequest(
      'me podría enviar un móvil con baulera al Vélez Sarfield 105',
    )).toBe(true);
    expect(looksLikeFreshTripRequest('ok')).toBe(false);
    expect(looksLikeFreshTripRequest('donde esta el chofer')).toBe(false);
    expect(looksLikeFreshTripRequest('Mitre 200')).toBe(false);
    expect(looksLikeFreshTripRequest('hola')).toBe(false);
  });

  it('conserva la cotización aunque el viaje anterior esté cerrado', () => {
    expect(shouldPreservePriceQuoteAfterTripReset({
      price_inquiry: true,
      awaiting_price_origin: true,
      last_bot_reply: 'Para darte el precio necesito las dos direcciones. ¿Cuál es el *origen* del viaje? (calle y número)',
    })).toBe(true);
    expect(shouldPreservePriceQuoteAfterTripReset({})).toBe(false);
  });
});
