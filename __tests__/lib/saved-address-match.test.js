const { parseGoogleMapsPoint, queryOverlapScore, savedAddressMatches } = require('../../shared/savedAddressMatch');
const { autocompleteAddressSalta } = require('../../shared/geo/nominatim');

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
    expect(savedAddressMatches(title, 'santa 1 pasaje 20')).toBe(true);
    expect(savedAddressMatches(title, 'santa ana')).toBe(false);
    expect(queryOverlapScore('santa 1 pasaje 20', title))
      .toBeGreaterThan(queryOverlapScore('santa 1 pasaje 20', 'santa victoria & pasaje anta'));
  });

  it('santa 1 pasaje 20 autocompleta la casa sin esperar al mapa', async () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const suggestions = await autocompleteAddressSalta('santa 1 pasaje 20', 5);
    expect(suggestions[0].title).toBe('Santa Ana 1, Pasaje 20, Casa 1421');
    expect(suggestions[0].lat).toBeCloseTo(-24.8638868, 6);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
