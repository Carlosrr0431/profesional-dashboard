const {
  resolveSaltaKnownPoi,
  looksLikeSaltaKnownPoi,
  fixPoiTypoTokens,
  getKnownPoiSearchQueries,
  getKnownPoiPollSeeds,
  buildPoiAutocompleteQueries,
  isCategoryPoiSearch,
  isSpecificNamedPoiQuery,
  getPoiSpecificSearchTokens,
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
    'unsa',
    'UNSA',
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

  it('resuelve Escuela de Emprendedores con dirección en Independencia 910', () => {
    const poi = resolveSaltaKnownPoi('Escuela de Emprendedores Salta');
    expect(poi?.id).toBe('escuela_emprendedores');
    expect(poi?.geocodeQuery).toMatch(/Independencia 910/i);
  });

  it('resuelve Escuela Normal de Maestras (nombre largo de Google)', () => {
    const poi = resolveSaltaKnownPoi(
      'Escuela Normal de Maestras General Manuel Belgrano',
    );
    expect(poi?.id).toBe('escuela_normal_belgrano');
    expect(poi?.geocodeQuery).toMatch(/Escuela Normal/i);
  });

  it('resuelve Espacio INCAA Hogar Escuela en Yrigoyen', () => {
    const poi = resolveSaltaKnownPoi('Espacio INCAA Hogar Escuela');
    expect(poi?.id).toBe('incaa_hogar_escuela');
    expect(poi?.geocodeQuery).toMatch(/4660|Yrigoyen/i);
  });

  it('getKnownPoiSearchQueries incluye alternativas de terminal', () => {
    const poi = resolveSaltaKnownPoi('la terminal');
    const queries = getKnownPoiSearchQueries(poi);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.some((q) => /omnibus/i.test(q))).toBe(true);
  });

  it('shopping genérico es categorySearch y apunta a centros reales (no Alto Palermo)', () => {
    const poi = resolveSaltaKnownPoi('el shoping');
    expect(poi?.id).toBe('shopping');
    expect(poi?.categorySearch).toBe(true);
    expect(isCategoryPoiSearch(poi)).toBe(true);
    expect(isCategoryPoiSearch(poi, 'Belgrano')).toBe(false);

    const queries = getKnownPoiSearchQueries(poi);
    expect(queries.some((q) => /portal\s+salta/i.test(q))).toBe(true);
    expect(queries.some((q) => /alto\s+noa/i.test(q))).toBe(true);
    expect(queries.some((q) => /paseo\s+del\s+cabildo/i.test(q))).toBe(true);
    expect(queries.some((q) => /alto\s+palermo/i.test(q))).toBe(false);

    const seeds = getKnownPoiPollSeeds(poi, 'el shoping');
    expect(seeds.length).toBeGreaterThanOrEqual(4);
    expect(seeds.some((s) => /portal/i.test(s.title))).toBe(true);
    expect(seeds.every((s) => s.title && s.geocodeQuery)).toBe(true);

    const autoQueries = buildPoiAutocompleteQueries('shoping');
    expect(autoQueries.length).toBeGreaterThanOrEqual(5);
  });

  it('hospital san bernardo es búsqueda específica, no categoría amplia', () => {
    const poi = resolveSaltaKnownPoi('hospital san bernado');
    expect(poi?.id).toBe('hospital');
    expect(isSpecificNamedPoiQuery('hola me mandas movil al hospital san bernado', poi)).toBe(true);
    expect(isCategoryPoiSearch(poi, '', 'hola me mandas movil al hospital san bernado')).toBe(false);
    expect(isCategoryPoiSearch(poi, '', 'el hospital')).toBe(true);

    const tokens = getPoiSpecificSearchTokens('hospital san bernado', poi);
    expect(tokens).toEqual(expect.arrayContaining(['bernardo']));
    expect(tokens).not.toContain('san');

    const queries = getKnownPoiSearchQueries(poi, 'hospital san bernado');
    expect(queries.some((q) => /militar/i.test(q))).toBe(false);
    expect(queries.some((q) => /materno/i.test(q))).toBe(false);
    expect(queries.some((q) => /san\s+bernardo/i.test(q))).toBe(true);

    const specificSeeds = getKnownPoiPollSeeds(poi, 'hospital san bernado');
    expect(specificSeeds.length).toBeGreaterThanOrEqual(2);
    expect(specificSeeds.every((s) => !s.categoryOnly)).toBe(true);
    expect(specificSeeds.some((s) => /tobias/i.test(s.subtitle))).toBe(true);
    expect(specificSeeds.some((s) => /boedo/i.test(s.subtitle))).toBe(true);

    const categorySeeds = getKnownPoiPollSeeds(poi, 'el hospital');
    expect(categorySeeds.some((s) => /materno|milagro|militar|papa/i.test(s.title))).toBe(true);
  });

  it('corrige bernado y resuelve hospital san bernardo', () => {
    expect(fixPoiTypoTokens('hospital san bernado')).toBe('hospital san bernardo');
    const poi = resolveSaltaKnownPoi('hospital san bernado');
    expect(poi?.id).toBe('hospital');
    expect(poi?.patterns?.length).toBeGreaterThan(0);
  });

  it('mergeDistinctAddressCandidates conserva lugares distintos', () => {
    const merged = mergeDistinctAddressCandidates(
      [{ formattedAddress: 'A 1', lat: -24.79, lng: -65.41, score: 1 }],
      [{ formattedAddress: 'B 2', lat: -24.80, lng: -65.42, score: 0.9 }]
    );
    expect(merged).toHaveLength(2);
  });
});
