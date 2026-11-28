jest.mock('../src/spa/shared/api', () => ({
  spaJson: jest.fn(),
}));

jest.mock('../src/spa/shared/coverage', () => ({
  isPickupInActiveZones: jest.fn(),
}));

const { spaJson } = require('../src/spa/shared/api');
const { resolveSuggestionPoint } = require('../src/spa/shared/geo');

function geocodeOk(lat, lng) {
  return {
    ok: true,
    data: {
      ok: true,
      data: {
        formattedAddress: 'Calle Caseros 2545, Salta',
        lat,
        lng,
        placeId: 'google:caseros',
      },
    },
  };
}

describe('resolveSuggestionPoint', () => {
  beforeEach(() => {
    spaJson.mockReset();
  });

  test('un pin de Google se usa sin volver a geocodificar', async () => {
    const point = await resolveSuggestionPoint({
      title: 'Farmacia',
      placeId: 'google:abc',
      lat: -24.79,
      lng: -65.41,
      formattedAddress: 'Farmacia, Salta',
    });
    expect(spaJson).not.toHaveBeenCalled();
    expect(point).toMatchObject({ lat: -24.79, lng: -65.41, placeId: 'google:abc' });
  });

  test('una calle del catálogo se geocodifica por texto, sin placeId street:', async () => {
    spaJson.mockResolvedValue(geocodeOk(-24.7880819, -65.4376924));
    const point = await resolveSuggestionPoint({
      title: 'Calle Caseros 2545',
      placeId: 'street:caseros',
      lat: -24.78,
      lng: -65.42,
      formattedAddress: 'Calle Caseros 2545',
    }, 'sess-1');
    expect(spaJson).toHaveBeenCalledTimes(1);
    const url = spaJson.mock.calls[0][0];
    expect(url).toContain('/api/geo/geocode?');
    expect(url).not.toContain('placeId=street');
    expect(url).toContain('Caseros+2545');
    expect(point).toMatchObject({ lat: -24.7880819, lng: -65.4376924 });
  });

  test('sin coordenadas pide el pin al servidor', async () => {
    spaJson.mockResolvedValue(geocodeOk(-24.79, -65.41));
    await resolveSuggestionPoint({
      title: 'Avenida San Martín 821',
      placeId: 'google:sm',
      formattedAddress: 'Avenida San Martín 821, Salta',
    });
    const url = spaJson.mock.calls[0][0];
    expect(url).toContain('placeId=google%3Asm');
    expect(url).toContain('San+Mart%C3%ADn+821');
  });
});
