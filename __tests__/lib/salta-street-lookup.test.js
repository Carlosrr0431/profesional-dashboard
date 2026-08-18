const {
  matchCatalogStreetPhrase,
  isExactCatalogStreetNameKey,
  isPlaceCategoryToken,
} = require('../../shared/salta-street-lookup');

describe('salta-street-lookup', () => {
  it('reconoce calles cortas del catálogo de Salta Capital', () => {
    expect(matchCatalogStreetPhrase(['belgrano'])?.name).toMatch(/belgrano/i);
    expect(matchCatalogStreetPhrase(['mitre'])?.name).toMatch(/mitre/i);
    expect(matchCatalogStreetPhrase(['caseros'])?.name).toMatch(/caseros/i);
    expect(matchCatalogStreetPhrase(['alvarado'])?.name).toMatch(/alvarado/i);
    expect(isExactCatalogStreetNameKey('españa')).toBe(true);
  });

  it('reconoce calles con fecha patrias', () => {
    expect(matchCatalogStreetPhrase(['20', 'febrero'])?.nameKey).toBe('20 de febrero');
    expect(matchCatalogStreetPhrase(['20', 'de', 'febrero'])?.nameKey).toBe('20 de febrero');
    expect(matchCatalogStreetPhrase(['febrero'])).toBeNull();
  });

  it('no trata ruido, comercios ni meses como calle', () => {
    expect(matchCatalogStreetPhrase(['madame'])).toBeNull();
    expect(matchCatalogStreetPhrase(['mostaza'])).toBeNull();
    expect(matchCatalogStreetPhrase(['mcdonalds'])).toBeNull();
    expect(matchCatalogStreetPhrase(['portal'])).toBeNull();
    expect(isPlaceCategoryToken('restaurante')).toBe(true);
    expect(isPlaceCategoryToken('parrilla')).toBe(true);
    expect(isPlaceCategoryToken('belgrano')).toBe(false);
  });
});
