const { parseGoogleMapsPoint, savedAddressMatches } = require('../../shared/savedAddressMatch');

describe('punto de Google Maps y dirección guardada', () => {
  it('lee el pin del enlace y no el centro del mapa', () => {
    const url = 'https://www.google.com/maps/place/24%C2%B051%2750.0%22S+65%C2%B028%2723.3%22W/@-24.8639093,-65.4733808,20z/data=!4m4!3m3!8m2!3d-24.8638868!4d-65.4731354';
    const point = parseGoogleMapsPoint(url);
    expect(point.lat).toBeCloseTo(-24.8638868, 6);
    expect(point.lng).toBeCloseTo(-65.4731354, 6);
  });

  it('acepta latitud y longitud escritas', () => {
    expect(parseGoogleMapsPoint('-24.86, -65.47').lat).toBeCloseTo(-24.86, 2);
  });

  it('encuentra la dirección solo si el texto trae sus palabras', () => {
    const title = 'Santa Ana 1, Pasaje 20, Casa 1421';
    expect(savedAddressMatches(title, 'Santa Ana 1 pasaje 20 Casa N 1421')).toBe(true);
    expect(savedAddressMatches(title, 'santa ana')).toBe(false);
  });
});
