const { installGeoFetchMock } = require('../helpers/geo-fetch-mock');
const { autocompleteAddressSalta } = require('../../shared/geo/nominatim');

describe('geo autocomplete', () => {
  beforeEach(() => {
    installGeoFetchMock();
  });

  it('usa TomTom POI para Unsa en lugar de Nominatim', async () => {
    const results = await autocompleteAddressSalta('Unsa', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((item) => /unsa|universidad nacional de salta/i.test(item.address))).toBe(true);

    const poiCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('poiSearch/'));
    const nominatimCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('nominatim'));
    expect(poiCalls.length).toBeGreaterThan(0);
    expect(nominatimCalls.length).toBe(0);
  });

  it('sigue usando Nominatim para calles del catálogo como Mitre', async () => {
    await autocompleteAddressSalta('Mitre', 5);

    const nominatimCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('nominatim'));
    expect(nominatimCalls.length).toBeGreaterThan(0);
  });

  it('devuelve direcciones con altura aunque Nominatim falle', async () => {
    const baseFetch = global.fetch.getMockImplementation();
    global.fetch.mockImplementation(async (url, options) => {
      if (String(url).includes('nominatim')) {
        return { ok: false, status: 502, json: async () => ({}) };
      }
      return baseFetch(url, options);
    });

    const entreRios = await autocompleteAddressSalta('Entre Rios 200', 5);
    expect(entreRios.length).toBeGreaterThan(0);

    const bolivia = await autocompleteAddressSalta('Bolivia 200', 5);
    expect(bolivia.length).toBeGreaterThan(0);
    expect(bolivia.some((item) => /bolivia/i.test(item.address))).toBe(true);
  });
});
