const {
  extractFullTripByPattern,
  splitAddressFromIntentPhrase,
  stripTrailingTripRouteTail,
  collapseEquivalentPollCandidates,
  getAddressPollIdentityKey,
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

  it('separa retiro y destino con "me voy para" tras coma', () => {
    const text =
      'Hola, me mandas un remis a Juan Gálvez 218, me voy para Tadeo tadia al 500';
    const trip = extractFullTripByPattern(text);

    expect(trip).toEqual({
      pickup: 'Juan Gálvez 218',
      destination: 'Tadeo tadia 500',
    });
  });

  it('no deja ", me" en el pickup cuando el destino empieza con "me voy para"', () => {
    const pickup = splitAddressFromIntentPhrase(
      'me mandas un remis a Juan Gálvez 218, me voy para Tadeo tadia al 500',
      /(?:mand[aá](?:me|as|an|s)?|necesito|quiero|pedido)\s+(?:un|una|uno|el|la)?\s*(?:remis|m[oó]vil|movil|taxi|auto|coche|viaje)?\s*(?:para|a|en)\s+/i,
    );

    expect(pickup).toBe('Juan Gálvez 218');
  });

  it('colapsa candidatos de poll equivalentes (Mitre 200 duplicado)', () => {
    const candidates = [
      {
        formattedAddress: 'Calle Gral Bartolomé Mitre 200, Salta, Argentina',
        pollLabel: 'Calle Gral Bartolomé Mitre 200',
        score: 0.9,
      },
      {
        formattedAddress: 'Gral Bartolomé Mitre 200, Salta, Argentina',
        pollLabel: 'Gral Bartolomé Mitre 200',
        score: 0.85,
      },
    ];

    const collapsed = collapseEquivalentPollCandidates(candidates);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].pollLabel).toBe('Calle Gral Bartolomé Mitre 200');
    expect(getAddressPollIdentityKey(candidates[0])).toBe(getAddressPollIdentityKey(candidates[1]));
  });

  it('colapsa intersección duplicada "y" vs "&"', () => {
    const candidates = [
      {
        title: 'Alvarado y Santa Fe',
        formattedAddress: 'Alvarado y Santa Fe, Salta, Argentina',
        lat: -24.7891,
        lng: -65.4112,
        score: 0.92,
      },
      {
        title: 'Alvarado & Santa Fe',
        formattedAddress: 'Alvarado & Santa Fe, Salta, Argentina',
        lat: -24.7892,
        lng: -65.4113,
        score: 0.9,
      },
    ];

    const collapsed = collapseEquivalentPollCandidates(candidates);

    expect(collapsed).toHaveLength(1);
    expect(getAddressPollIdentityKey(candidates[0])).toBe(getAddressPollIdentityKey(candidates[1]));
  });

  it('conserva calles homónimas distintas (Güemes)', () => {
    const candidates = [
      {
        formattedAddress: 'Gral Martin Güemes 400, Salta, Argentina',
        pollLabel: 'Gral Martin Güemes 400',
        score: 0.9,
        street: { nameKey: 'gral-martin-guemes' },
      },
      {
        formattedAddress: 'Dr Adolfo Güemes 400, Salta, Argentina',
        pollLabel: 'Dr Adolfo Güemes 400',
        score: 0.88,
        street: { nameKey: 'dr-adolfo-guemes' },
      },
    ];

    const collapsed = collapseEquivalentPollCandidates(candidates);

    expect(collapsed).toHaveLength(2);
  });

  it('no colapsa variantes de catálogo sin coordenadas (lat/lng null)', () => {
    const candidates = [
      {
        formattedAddress: 'Calle Dr Adolfo Guemes 300, Salta, Argentina',
        pollLabel: 'Calle Dr Adolfo Guemes 300',
        lat: null,
        lng: null,
        score: 1.1,
        source: 'catalog_variant',
        street: { type: 'calle', nameKey: 'dr adolfo guemes' },
      },
      {
        formattedAddress: 'Avenida Dr Luis Guemes 300, Salta, Argentina',
        pollLabel: 'Avenida Dr Luis Guemes 300',
        lat: null,
        lng: null,
        score: 1.2,
        source: 'catalog_variant',
        street: { type: 'avenida', nameKey: 'dr luis guemes' },
      },
      {
        formattedAddress: 'Calle Domingo Guemes 300, Salta, Argentina',
        pollLabel: 'Calle Domingo Guemes 300',
        lat: null,
        lng: null,
        score: 1.1,
        source: 'catalog_variant',
        street: { type: 'calle', nameKey: 'domingo guemes' },
      },
      {
        formattedAddress: 'Avenida Gral Guemes 300, Salta, Argentina',
        pollLabel: 'Avenida General Güemes 300',
        lat: null,
        lng: null,
        score: 1.2,
        source: 'catalog_variant',
        street: { type: 'avenida', nameKey: 'general guemes' },
      },
      {
        formattedAddress: 'Calle Gral Guemes 300, Salta, Argentina',
        pollLabel: 'Calle General Güemes 300',
        lat: null,
        lng: null,
        score: 1.1,
        source: 'catalog_variant',
        street: { type: 'calle', nameKey: 'general guemes' },
      },
    ];

    const collapsed = collapseEquivalentPollCandidates(candidates);

    expect(collapsed).toHaveLength(5);
    expect(collapsed.map((c) => c.pollLabel).sort()).toEqual([
      'Avenida Dr Luis Guemes 300',
      'Avenida General Güemes 300',
      'Calle Domingo Guemes 300',
      'Calle Dr Adolfo Guemes 300',
      'Calle General Güemes 300',
    ].sort());
  });
});
