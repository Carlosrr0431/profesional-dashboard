/** @jest-environment node */

const MANUELA = { lat: -24.79687, lng: -65.40186 };

const googleSearch = jest.fn();

jest.mock('../../shared/geo/googlePlaces', () => ({
  searchPoiSalta: (...args) => googleSearch(...args),
  getGooglePlaceDetails: jest.fn(),
  rememberGoogleResolution: jest.fn(),
  isGooglePlaceId: (id) => String(id || '').startsWith('google:'),
  isGoogleConfigured: () => true,
  createSessionToken: () => 'tok',
}));

jest.mock('../../shared/geo/georef', () => ({
  lookupGeorefHouseNumbers: async () => ({ located: [], missingLabel: null }),
  searchGeorefAddress: async () => [],
  resolveGeorefPlaceId: jest.fn(),
  fetchGeorefCalles: jest.fn(async () => []),
}));

const { streetNameAgrees } = require('../../shared/geo/placesBudget');
const { geocodeAddress } = require('../../shared/geo/nominatim');

function manuelaHit(number) {
  return {
    placeId: `google:manuela-${number}`,
    title: `Manuela González de Todd ${number}`,
    subtitle: 'Salta',
    address: `Manuela González de Todd ${number}, Salta`,
    formattedAddress: `Manuela González de Todd ${number}, A4400 Salta, Argentina`,
    lat: MANUELA.lat,
    lng: MANUELA.lng,
  };
}

describe('streetNameAgrees', () => {
  it('rechaza otra calle que solo comparte el apellido y el número', () => {
    expect(streetNameAgrees('Jose Maria Todd 300', 'Manuela González de Todd 300')).toBe(false);
    expect(streetNameAgrees('Manuela Gonzalez de Todd 673', 'Jose Maria Todd 673, Salta')).toBe(false);
  });

  it('acepta la misma calle, con o sin tildes', () => {
    expect(streetNameAgrees('Manuela Gonzalez de Todd 673', 'Manuela González de Todd 673, A4400 Salta')).toBe(true);
    expect(streetNameAgrees('Lola Mora 886', 'Lola Mora 886, Salta')).toBe(true);
    expect(streetNameAgrees('Jose Maria Todd 300', 'Pasaje José María Todd 300')).toBe(true);
  });

  it('con un solo apellido acepta el nombre completo que trae Google', () => {
    expect(streetNameAgrees('Belgrano 500', 'General Manuel Belgrano 500')).toBe(true);
    expect(streetNameAgrees('Güemes 700', 'Avenida General Güemes 700')).toBe(true);
    expect(streetNameAgrees('Mitre 200', 'Bartolomé Mitre 200')).toBe(true);
    expect(streetNameAgrees('J. M. Leguizamon 1455', 'Juan Martin Leguizamon 1455')).toBe(true);
  });
});

describe('geocodeAddress no devuelve otra calle con el mismo número', () => {
  beforeEach(() => {
    googleSearch.mockReset();
  });

  it('"Jose Maria Todd 300" no termina en el punto de Manuela González de Todd', async () => {
    googleSearch.mockResolvedValue([manuelaHit(300)]);
    const outcome = await geocodeAddress('Jose Maria Todd 300').catch((error) => ({ error }));
    if (!outcome.error) {
      expect(outcome.lat).not.toBeCloseTo(MANUELA.lat, 4);
      expect(String(outcome.formattedAddress || '')).not.toMatch(/manuela/i);
    }
  });

  it('"Manuela Gonzalez de Todd 300" sí usa el punto de Google', async () => {
    googleSearch.mockResolvedValue([manuelaHit(300)]);
    const point = await geocodeAddress('Manuela Gonzalez de Todd 300');
    expect(point.lat).toBeCloseTo(MANUELA.lat, 5);
    expect(point.lng).toBeCloseTo(MANUELA.lng, 5);
  });
});
