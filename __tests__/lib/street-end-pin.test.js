const { alignStreetNumberPins } = require('../../shared/salta-address');
const { pickOfficialHouseNumber } = require('../../shared/geo/nominatim');

const STREETS = [
  'Leguizamon', 'Sarmiento', 'Belgrano', 'Zuviria', 'Pueyrredon', 'Balcarce',
  'Necochea', 'Catamarca', 'Cordoba', 'Mendoza', 'Tucuman', 'Formosa',
  'Misiones', 'Corrientes', 'Rivadavia', 'Entre Rios',
];

function along(step) {
  return { lat: -24.79, lng: -65.46 + step * 0.0011 };
}

describe('la altura oficial no cae en la otra punta de la calle', () => {
  test.each(STREETS)('%s: el pin cacheado en el final usa la altura oficial', (name) => {
    const official = along(4);
    const farEnd = along(16);
    const items = alignStreetNumberPins([
      {
        placeId: 'google:cache',
        title: `J. M. ${name} 800`,
        formattedAddress: `J. M. ${name} 800, Salta`,
        lat: farEnd.lat,
        lng: farEnd.lng,
      },
      {
        placeId: 'georef:-24.7900000,-65.4556000',
        title: `JUAN MARTIN ${name.toUpperCase()} 800`,
        address: `JUAN MARTIN ${name.toUpperCase()} 800, Salta`,
        lat: official.lat,
        lng: official.lng,
      },
    ], `J. M. ${name} 800`);

    expect(items[0].lat).toBeCloseTo(official.lat, 5);
    expect(items[0].lng).toBeCloseTo(official.lng, 5);
    expect(items[1].lng).toBeCloseTo(official.lng, 5);
  });

  test.each(STREETS)('%s: Georef gana aunque el pin de Google esté a 1 km', (name) => {
    const official = { lat: -24.783, lng: -65.422, address: { road: name, house_number: '800' } };
    const farEnd = { lat: -24.782, lng: -65.434 };
    const chosen = pickOfficialHouseNumber([official], farEnd);
    expect(chosen.lng).toBeCloseTo(official.lng, 5);
  });

  test('dos calles homónimas no se mezclan', () => {
    const martin = { lat: -24.7868, lng: -65.4006 };
    const adolfo = { lat: -24.7874, lng: -65.4178 };
    expect(pickOfficialHouseNumber(
      [martin, adolfo],
      { lat: -24.7868, lng: -65.4012 },
    )).toEqual(martin);
    expect(pickOfficialHouseNumber([martin, adolfo], null)).toBeNull();
  });
});
