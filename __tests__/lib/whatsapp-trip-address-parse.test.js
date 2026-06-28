const {
  extractFullTripByPattern,
  splitAddressFromIntentPhrase,
  stripTrailingTripRouteTail,
} = require('../../src/lib/whatsappTripAddressParse');

describe('whatsappTripAddressParse', () => {
  it('separa retiro y destino con "es para ir hasta"', () => {
    const text = 'hola, me mandas un remis a mitre al 200 es para ir hasta guemes al 400';
    const trip = extractFullTripByPattern(text);

    expect(trip).toEqual({
      pickup: 'Mitre 200',
      destination: 'Güemes 400',
    });
  });

  it('corta el pickup antes de "es para ir hasta" en pedidos directos', () => {
    const pickup = splitAddressFromIntentPhrase(
      'me mandas un remis a mitre al 200 es para ir hasta guemes al 400',
      /(?:remis|m[oó]vil|movil|taxi|auto)\s+(?:para|a|en)\s+/i,
    );

    expect(pickup).toBe('Mitre 200');
  });

  it('limpia restos de frase de ruta en el pickup', () => {
    expect(stripTrailingTripRouteTail('Mitre 200 es para ir')).toBe('Mitre 200');
    expect(stripTrailingTripRouteTail('Belgrano 300 voy para')).toBe('Belgrano 300');
  });
});
