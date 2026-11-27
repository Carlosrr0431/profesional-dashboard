jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn(() => {
    throw new Error('supabase no usado en lookup_address');
  }),
}));

jest.mock('../../shared/geo/osrm.js', () => ({
  getRouteMetricsByAddress: jest.fn(),
}));

const { lookupAddress, resolveLookupAddress } = require('../../src/lib/tripIntentTools');
const { matchCatalogStreetClosestToEnd } = require('../../shared/salta-street-lookup');

/** Caso real del 21/11: pidió "Manuela Gonzalez de todd 673" y el móvil salió por "José María Todd". */
describe('Manuela González de Todd no se confunde con José María Todd', () => {
  it('el catálogo tiene las dos calles y distingue por el nombre completo', () => {
    expect(matchCatalogStreetClosestToEnd(['manuela', 'gonzalez', 'todd'])?.name).toMatch(/manuela gonzalez de todd/i);
    expect(matchCatalogStreetClosestToEnd(['manuela', 'todd'])?.name).toMatch(/manuela gonzalez de todd/i);
    expect(matchCatalogStreetClosestToEnd(['jose', 'maria', 'todd'])?.name).toMatch(/jose maria todd/i);
  });

  it('"todd" solo es ambiguo: hay dos calles, no se elige una', () => {
    const result = matchCatalogStreetClosestToEnd(['todd']);
    expect(result?.ambiguous).toBe(true);
  });

  it('mantiene el nombre que escribió el pasajero, con o sin departamento', () => {
    for (const text of [
      'Manuela Gonzalez de todd 673 dpto D',
      'Manuela Gonzalez de todd 673',
      'Manuela g de todd 673',
    ]) {
      const result = lookupAddress(text);
      expect(result.found).toBe(true);
      expect(result.canonical).toMatch(/manuela gonzalez de todd 673/i);
      expect(result.canonical).not.toMatch(/jose maria/i);
    }
  });

  it('José María Todd sigue resolviendo a su calle', () => {
    const result = lookupAddress('Jose Maria Todd 300');
    expect(result.canonical).toMatch(/jose maria todd 300/i);
    expect(result.canonical).not.toMatch(/manuela/i);
  });
});

describe('si el catálogo se equivoca de calle, Google lo corrige', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../../shared/salta-street-lookup');
    jest.dontMock('../../shared/geo/nominatim.js');
  });

  it('con el catálogo viejo (sin la calle), un nombre completo no queda en la calle equivocada', async () => {
    jest.resetModules();
    jest.doMock('../../shared/salta-street-lookup', () => ({
      ...jest.requireActual('../../shared/salta-street-lookup'),
      matchCatalogStreetClosestToEnd: () => ({ name: 'Jose Maria Todd', nameKey: 'jose maria todd', ambiguous: false }),
    }));
    jest.doMock('../../shared/geo/nominatim.js', () => ({
      ...jest.requireActual('../../shared/geo/nominatim.js'),
      autocompleteAddressSalta: jest.fn(async () => [{
        title: 'Manuela González de Todd 673',
        subtitle: 'Salta',
        placeId: 'google:manuela-todd-673',
      }]),
    }));
    const tools = require('../../src/lib/tripIntentTools');
    const result = await tools.resolveLookupAddress('Manuela Gonzalez de todd 673 dpto D');
    expect(result.canonical).toMatch(/manuela gonz[aá]lez de todd 673/i);
    expect(result.canonical).not.toMatch(/jose maria/i);
  });

  it('un departamento o un piso no disparan una consulta de más', async () => {
    const before = global.fetch.mock.calls.filter(([url]) => String(url).includes('places:autocomplete')).length;
    const result = await resolveLookupAddress('Mitre 200 piso 2 dpto D');
    const after = global.fetch.mock.calls.filter(([url]) => String(url).includes('places:autocomplete')).length;
    expect(result.canonical).toMatch(/mitre 200/i);
    expect(after).toBe(before);
  });
});
