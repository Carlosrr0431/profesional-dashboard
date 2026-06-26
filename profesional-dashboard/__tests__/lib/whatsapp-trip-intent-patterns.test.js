import {
  buildPatternTripExtraction,
  classifyWhatsAppIncomingText,
  looksLikeTripRequest,
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
});
