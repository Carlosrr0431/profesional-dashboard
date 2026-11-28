/** @jest-environment node */

const OFFICIAL = {
  lat: -24.7829215,
  lng: -65.4222405,
  formattedAddress: 'JUAN MARTIN LEGUIZAMON 1455, Salta, Capital, Salta',
  placeId: 'georef:-24.7829215,-65.4222405',
  address: { road: 'JUAN MARTIN LEGUIZAMON', house_number: '1455', city: 'Salta' },
};

const googleSearch = jest.fn();

jest.mock('../../shared/geo/googlePlaces', () => ({
  searchPoiSalta: (...args) => googleSearch(...args),
  getGooglePlaceDetails: jest.fn(async () => ({
    lat: -24.7820515,
    lng: -65.433262,
    formattedAddress: 'J. M. Leguizamon 1455, A4400 Salta, Argentina',
    placeId: 'google:bad-end',
    geocodeSource: 'cache',
  })),
  rememberGoogleResolution: jest.fn(),
  isGooglePlaceId: (id) => String(id || '').startsWith('google:'),
  isGoogleConfigured: () => true,
  createSessionToken: () => 'tok',
}));

jest.mock('../../shared/geo/georef', () => {
  const official = {
    lat: -24.7829215,
    lng: -65.4222405,
    formattedAddress: 'JUAN MARTIN LEGUIZAMON 1455, Salta, Capital, Salta',
    placeId: 'georef:-24.7829215,-65.4222405',
    address: { road: 'JUAN MARTIN LEGUIZAMON', house_number: '1455', city: 'Salta' },
  };
  const alsina = {
    lat: -24.7796714,
    lng: -65.4136409,
    formattedAddress: 'ALSINA 864, Salta, Capital, Salta',
    placeId: 'georef:-24.7796714,-65.4136409',
    address: { road: 'ALSINA', house_number: '864', city: 'Salta' },
  };
  const lookup = async (query) => {
    const text = String(query || '').toLowerCase();
    if (text.includes('alsina') && text.includes('864')) {
      if (/\bdr\b/.test(text) || /\bcalle\b/.test(text)) {
        return { located: [], missingLabel: null };
      }
      return { located: [alsina], missingLabel: null };
    }
    if (/\bj\.?\s*m\.?/.test(text) || /\bjm\b/.test(text)) {
      return { located: [], missingLabel: null };
    }
    if (text.includes('leguizamon') && text.includes('1455')) {
      return { located: [official], missingLabel: null };
    }
    return { located: [], missingLabel: null };
  };
  return {
    lookupGeorefHouseNumbers: lookup,
    searchGeorefAddress: async (query) => (await lookup(query)).located,
    resolveGeorefPlaceId: jest.fn(),
    fetchGeorefCalles: jest.fn(async () => []),
  };
});

const { geocodeAddress, getPlaceDetails, officialHousePin } = require('../../shared/geo/nominatim');

describe('una calle con altura no usa el pin de Google de la otra punta', () => {
  beforeEach(() => {
    googleSearch.mockReset();
    googleSearch.mockResolvedValue([{
      placeId: 'google:bad-end',
      title: 'J. M. Leguizamon 1455',
      address: 'J. M. Leguizamon 1455, Salta',
      formattedAddress: 'J. M. Leguizamon 1455, A4400 Salta, Argentina',
      lat: -24.7820515,
      lng: -65.433262,
    }]);
  });

  test('la altura oficial sale de Georef sin esperar a Google', async () => {
    const pin = await officialHousePin('Leguizamon 1455');
    expect(pin.geocodeSource).toBe('georef');
    expect(pin.lat).toBeCloseTo(OFFICIAL.lat, 5);
    expect(pin.lng).toBeCloseTo(OFFICIAL.lng, 5);
    expect(googleSearch).not.toHaveBeenCalled();
  });

  test('Calle Dr A Alsina 864 se ubica aunque Georef no conozca el título', async () => {
    const pin = await officialHousePin('Calle Dr A Alsina 864, Salta');
    expect(pin.geocodeSource).toBe('georef');
    expect(pin.lat).toBeCloseTo(-24.7796714, 5);
    expect(pin.lng).toBeCloseTo(-65.4136409, 5);
    expect(googleSearch).not.toHaveBeenCalled();
  });

  test('J. M. Leguizamon 1455 queda en la cuadra oficial', async () => {
    const point = await geocodeAddress('J. M. Leguizamon 1455');
    expect(point.geocodeSource).toBe('georef');
    expect(point.lat).toBeCloseTo(OFFICIAL.lat, 5);
    expect(point.lng).toBeCloseTo(OFFICIAL.lng, 5);
    // Google se consulta primero (es el punto exacto), pero su pin a 1,1 km de la cuadra oficial se descarta.
    expect(googleSearch).toHaveBeenCalled();
  });

  test('un pin de Google a pocos metros del padrón se respeta (Independencia, Georef corrido 360 m)', async () => {
    googleSearch.mockResolvedValue([{
      placeId: 'google:rooftop',
      title: 'J. M. Leguizamon 1455',
      address: 'J. M. Leguizamon 1455, Salta',
      formattedAddress: 'J. M. Leguizamon 1455, A4400 Salta, Argentina',
      lat: OFFICIAL.lat + 0.0032,
      lng: OFFICIAL.lng,
    }]);
    const point = await geocodeAddress('J. M. Leguizamon 1455');
    expect(point.geocodeSource).not.toBe('georef');
    expect(point.lat).toBeCloseTo(OFFICIAL.lat + 0.0032, 5);
  });

  test('elegir el lugar de Google igual reemplaza el pin por la altura oficial', async () => {
    const point = await getPlaceDetails('google:bad-end', {
      title: 'J. M. Leguizamon 1455',
      formattedAddress: 'J. M. Leguizamon 1455, Salta',
    });
    expect(point.geocodeSource).toBe('georef');
    expect(point.lng).toBeCloseTo(OFFICIAL.lng, 5);
  });
});
