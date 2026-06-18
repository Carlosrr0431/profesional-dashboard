const {
  resolveSaltaKnownPoi,
  looksLikeSaltaKnownPoi,
  fixPoiTypoTokens,
  getKnownPoiSearchQueries,
  mergeDistinctAddressCandidates,
} = require('../../src/lib/saltaKnownPois');

describe('saltaKnownPois', () => {
  it('corrige terminalk y resuelve terminal', () => {
    const poi = resolveSaltaKnownPoi('la terminalk');
    expect(poi?.id).toBe('terminal');
    expect(poi?.geocodeQuery).toContain('Terminal');
  });

  it.each([
    'la terminal',
    'LA TERMINAL',
    'terminal de omnibus',
    'el shopping',
    'SHOPPING',
    'shoping',
    'el hospital',
    'aeropuerto',
    'la plaza',
  ])('detecta POI: %s', (phrase) => {
    expect(looksLikeSaltaKnownPoi(phrase)).toBe(true);
    expect(resolveSaltaKnownPoi(phrase)).not.toBeNull();
  });

  it('no confunde Mitre 200 con POI', () => {
    expect(looksLikeSaltaKnownPoi('Mitre 200')).toBe(false);
    expect(resolveSaltaKnownPoi('Mitre 200')).toBeNull();
  });

  it('fixPoiTypoTokens normaliza typos', () => {
    expect(fixPoiTypoTokens('la terminalk')).toBe('la terminal');
    expect(fixPoiTypoTokens('el shoping')).toBe('el shopping');
  });

  it('getKnownPoiSearchQueries incluye alternativas de terminal', () => {
    const poi = resolveSaltaKnownPoi('la terminal');
    const queries = getKnownPoiSearchQueries(poi);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.some((q) => /omnibus/i.test(q))).toBe(true);
  });

  it('mergeDistinctAddressCandidates conserva lugares distintos', () => {
    const merged = mergeDistinctAddressCandidates(
      [{ formattedAddress: 'A 1', lat: -24.79, lng: -65.41, score: 1 }],
      [{ formattedAddress: 'B 2', lat: -24.80, lng: -65.42, score: 0.9 }]
    );
    expect(merged).toHaveLength(2);
  });
});
