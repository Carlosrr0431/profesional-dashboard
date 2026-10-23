/** @jest-environment node */

const mockGetPlaceDetails = jest.fn();
const mockGeocodeAddress = jest.fn();

jest.mock('../../src/lib/geo/index.js', () => ({
  getPlaceDetails: (...args) => mockGetPlaceDetails(...args),
  geocodeAddress: (...args) => mockGeocodeAddress(...args),
}));

jest.mock('../../src/lib/geocodeErrorLog', () => ({
  logGeocodeErrorAsync: jest.fn(),
}));

jest.mock('../../shared/geo/googlePlaces.js', () => ({
  isGoogleConfigured: () => true,
}));

const CAMPO_QUIJANO = { lat: -24.907204, lng: -65.6441178, formattedAddress: 'Campo Quijano, Salta Province, Argentina' };

async function callGeocode(params) {
  const { GET } = await import('../../app/api/geo/geocode/route.js');
  const response = await GET(new Request(`http://test/api/geo/geocode?${new URLSearchParams(params)}`));
  return { status: response.status, payload: await response.json() };
}

describe('GET /api/geo/geocode', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetPlaceDetails.mockReset();
    mockGeocodeAddress.mockReset();
  });

  it('acepta una sugerencia elegida en Campo Quijano (fuera de Capital, dentro del valle)', async () => {
    mockGetPlaceDetails.mockResolvedValue(CAMPO_QUIJANO);
    const { status, payload } = await callGeocode({ placeId: 'google:quijano', title: 'Campo Quijano' });
    expect(status).toBe(200);
    expect(payload.data).toMatchObject({ lat: CAMPO_QUIJANO.lat, lng: CAMPO_QUIJANO.lng });
  });

  it('rechaza una sugerencia fuera del valle', async () => {
    mockGetPlaceDetails.mockResolvedValue({ lat: -24.19, lng: -65.3, formattedAddress: 'San Salvador de Jujuy' });
    const { status, payload } = await callGeocode({ placeId: 'google:jujuy' });
    expect(status).toBe(400);
    expect(payload.error).toMatch(/zona de cobertura/);
  });

  it('con texto libre solo acepta fuera de Capital si nombra la localidad', async () => {
    mockGeocodeAddress.mockResolvedValue(CAMPO_QUIJANO);
    expect((await callGeocode({ address: 'Güemes 700, Salta, Argentina' })).status).toBe(400);
    expect((await callGeocode({ address: 'Campo Quijano, Salta' })).status).toBe(200);
  });
});
