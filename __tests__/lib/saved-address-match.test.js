const { parseGoogleMapsPoint, queryOverlapScore, savedAddressMatches } = require('../../shared/savedAddressMatch');
const { autocompleteAddressSalta } = require('../../shared/geo/nominatim');

describe('punto de Google Maps y dirección guardada', () => {
  it('lee el pin del enlace y no el centro del mapa', () => {
    const url = 'https://www.google.com/maps/place/24%C2%B051%2750.0%22S+65%C2%B028%2723.3%22W/@-24.8639093,-65.4733808,20z/data=!4m4!3m3!8m2!3d-24.8638868!4d-65.4731354';
    const point = parseGoogleMapsPoint(url);
    expect(point.lat).toBeCloseTo(-24.8638868, 6);
    expect(point.lng).toBeCloseTo(-65.4731354, 6);
  });

  it('acepta el enlace corto q=latitud,longitud', () => {
    const point = parseGoogleMapsPoint('https://maps.google.com/maps?q=-24.8772243%2C-65.4034545&z=17&hl=es');
    expect(point.lat).toBeCloseTo(-24.8772243, 6);
    expect(point.lng).toBeCloseTo(-65.4034545, 6);
  });

  it('lee q=lat,lng sin codificar y no lo mueve', () => {
    const point = parseGoogleMapsPoint('https://www.google.com/maps?q=-24.7944312,-65.3768616&z=17&hl=es');
    expect(point.lat).toBe(-24.7944312);
    expect(point.lng).toBe(-65.3768616);
  });

  it('acepta latitud y longitud escritas', () => {
    expect(parseGoogleMapsPoint('-24.86, -65.47').lat).toBeCloseTo(-24.86, 2);
  });

  it('encuentra la dirección si el texto trae sus palabras y números', () => {
    const title = 'Santa Ana 1, Pasaje 20, Casa 1421';
    expect(savedAddressMatches(title, 'Santa Ana 1 pasaje 20 Casa N 1421')).toBe(true);
    expect(savedAddressMatches(title, 'santa 1 pasaje 20')).toBe(true);
    expect(savedAddressMatches(title, 'santa ana')).toBe(true);
    expect(savedAddressMatches('Barrio Río Ancho, Casa 2, Gomería', 'barrio rio ancho casa 2 gomeria')).toBe(true);
    expect(savedAddressMatches('Barrio Río Ancho, Casa 2, Gomería', 'barrio san jose')).toBe(false);
    expect(savedAddressMatches('Centro Vecinal Barrio San José', 'barrio san jose')).toBe(true);
    expect(savedAddressMatches(title, 'mitre')).toBe(false);
    expect(savedAddressMatches(
      'Señora del Carmen, Mza F50, Lote 210',
      'señora del carmen',
    )).toBe(true);
    expect(savedAddressMatches(
      'Señora del Carmen, Mza F50, Lote 210',
      'señora del carmen manzana',
    )).toBe(true);
    expect(savedAddressMatches(
      'Santa Rita 2, La Isla, Manzana 20, Casa 5',
      'santa rita 2 la isla manzana 20 casa 5',
    )).toBe(true);
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

  it('santa rita 2 la isla autocompleta la manzana 20 casa 5', async () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const suggestions = await autocompleteAddressSalta('santa rita 2 la isla manzana 20 casa 5', 5);
    expect(suggestions[0].title).toBe('Santa Rita 2, La Isla, Manzana 20, Casa 5');
    expect(suggestions[0].lat).toBeCloseTo(-24.8772243, 6);
    expect(suggestions[0].lng).toBeCloseTo(-65.4034545, 6);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('barrio rio ancho casa 2 autocompleta la gomería', async () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const suggestions = await autocompleteAddressSalta('barrio rio ancho casa 2 gomeria', 5);
    expect(suggestions[0].title).toBe('Barrio Río Ancho, Casa 2, Gomería');
    expect(suggestions[0].lat).toBeCloseTo(-24.8533069, 6);
    expect(suggestions[0].lng).toBeCloseTo(-65.4045727, 6);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('señora del carmen muestra la manzana aunque se escriba mza o manzana', async () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const byName = await autocompleteAddressSalta('señora del carmen', 5);
    expect(byName.some((item) => item.title === 'Señora del Carmen, Mza F50, Lote 210')).toBe(true);
    const byManzana = await autocompleteAddressSalta('señora del carmen manzana', 5);
    expect(byManzana[0].title).toBe('Señora del Carmen, Mza F50, Lote 210');
    expect(byManzana[0].lng).toBeCloseTo(-65.4369189, 6);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
