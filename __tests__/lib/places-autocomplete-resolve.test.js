const { installGeoFetchMock } = require('../helpers/geo-fetch-mock');
const {
  autocompleteAndResolveAddresses,
  geocodeAddressViaPlaces,
  getAutocompletePollCandidates,
} = require('../../src/lib/geo/placesAutocompleteResolve.js');

describe('placesAutocompleteResolve', () => {
  beforeEach(() => {
    installGeoFetchMock();
  });

  it('resuelve Mitre 200 con coords vía autocomplete + Place Details', async () => {
    const hits = await autocompleteAndResolveAddresses('Mitre 200', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].lat).toBeCloseTo(-24.7874909, 3);
    expect(hits[0].lng).toBeCloseTo(-65.4107292, 3);
    expect(/mitre/i.test(hits[0].formattedAddress)).toBe(true);
  });

  it('geocodeAddressViaPlaces elige el mejor match por score, no el primer hit', async () => {
    const geo = await geocodeAddressViaPlaces('Chacabuco 350, Salta');
    expect(geo.lat).toBeCloseTo(-24.7889, 3);
    expect(/chacabuco/i.test(geo.formattedAddress)).toBe(true);
  });

  it('getAutocompletePollCandidates devuelve sugerencias Google sin coords (como dashboard)', async () => {
    const hits = await getAutocompletePollCandidates('guemes 200', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.source === 'google_autocomplete')).toBe(true);
    expect(hits.every((h) => String(h.placeId).startsWith('google:'))).toBe(true);
    expect(hits.every((h) => h.lat == null && h.lng == null)).toBe(true);
    expect(hits.some((h) => /g[uü]emes/i.test(h.title))).toBe(true);
    expect(hits.some((h) => /el pilar|don bosco|salta/i.test(h.subtitle || ''))).toBe(true);
  });
});

describe('isVagueLocalityAddress / formatIntersectionLabelFromQuery', () => {
  const {
    isVagueLocalityAddress,
    formatIntersectionLabelFromQuery,
  } = require('../../shared/salta-address.js');

  it('detecta CP/localidad genéricos de Google', () => {
    expect(isVagueLocalityAddress('A4400 Salta, Salta Province, Argentina')).toBe(true);
    expect(isVagueLocalityAddress('Salta, Argentina')).toBe(true);
    expect(isVagueLocalityAddress('Alvarado y Santa Fe, Salta')).toBe(false);
    expect(isVagueLocalityAddress('Mitre 200, A4400 Salta, Argentina')).toBe(false);
  });

  it('arma label legible de intersección desde el query', () => {
    expect(formatIntersectionLabelFromQuery('alvarado esquina santa fe')).toBe(
      'Alvarado y Santa Fe, Salta',
    );
    expect(formatIntersectionLabelFromQuery('Alvarado & Santa Fe, Salta')).toBe(
      'Alvarado y Santa Fe, Salta',
    );
  });
});

describe('approachOnlyTripPayload rejects vague pickup', () => {
  const { buildApproachOnlyTripInsertPayload } = require('../../src/lib/approachOnlyTripPayload');

  it('rechaza origin A4400 genérico', () => {
    expect(() =>
      buildApproachOnlyTripInsertPayload({
        pickupLocation: {
          formattedAddress: 'A4400 Salta, Salta Province, Argentina',
          lat: -24.79,
          lng: -65.4,
        },
        passengerName: 'Test',
        passengerPhone: '5493870000000',
        source: 'whatsapp',
      }),
    ).toThrow(/pickupLocation inválida/i);
  });

  it('acepta intersección precisa', () => {
    const payload = buildApproachOnlyTripInsertPayload({
      pickupLocation: {
        formattedAddress: 'Alvarado y Santa Fe, Salta',
        lat: -24.79,
        lng: -65.4,
      },
      passengerName: 'Test',
      passengerPhone: '5493870000000',
      source: 'whatsapp',
    });
    expect(payload.origin_address).toBe('Alvarado y Santa Fe, Salta');
    expect(payload.notes).toContain('Alvarado y Santa Fe, Salta');
  });
});
