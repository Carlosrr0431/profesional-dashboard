const { findPinnedAddress } = require('../../shared/pinned-addresses');
const { autocompleteAddressSalta, geocodeAddress } = require('../../shared/geo/nominatim');

describe('Santa Ana pasaje 20 casa 1421', () => {
  it('cae en el pin indicado y no llama al mapa', async () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const query = 'Santa Ana 1 pasaje 20 Casa N° 1421';
    const hit = findPinnedAddress(query);
    expect(hit.lat).toBeCloseTo(-24.8638868, 6);
    expect(hit.lng).toBeCloseTo(-65.4731354, 6);

    const suggestions = await autocompleteAddressSalta(query, 5);
    expect(suggestions[0].title).toBe('Santa Ana 1, Pasaje 20, Casa 1421');
    expect(suggestions[0].lat).toBeCloseTo(-24.8638868, 6);
    expect(suggestions[0].lng).toBeCloseTo(-65.4731354, 6);

    const geo = await geocodeAddress('santa ana pasaje 20 casa 1421');
    expect(geo.lat).toBeCloseTo(-24.8638868, 6);
    expect(geo.lng).toBeCloseTo(-65.4731354, 6);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ubica Marcelino Cornejo 751 en Ing. Abel Cornejo y Independencia 392 en su casa', () => {
    const cornejo = findPinnedAddress('marcelino cornejo 751');
    expect(cornejo.title).toBe('Ing. Abel Cornejo 751');
    expect(cornejo.lat).toBeCloseTo(-24.7973297, 6);
    expect(cornejo.lng).toBeCloseTo(-65.4363874, 6);
    expect(findPinnedAddress('marcelino cornejo 200')).toBeNull();

    const independencia = findPinnedAddress('avenida independencia 392');
    expect(independencia.title).toBe('Av. Independencia 392');
    expect(independencia.lat).toBeCloseTo(-24.8083069, 6);
    expect(independencia.lng).toBeCloseTo(-65.4104266, 6);
    expect(findPinnedAddress('avenida independencia 100')).toBeNull();

    const caseros = findPinnedAddress('Calle Caseros 2545, Salta');
    expect(caseros.title).toBe('Caseros 2545');
    expect(caseros.lat).toBeCloseTo(-24.7880819, 6);
    expect(caseros.lng).toBeCloseTo(-65.4376924, 6);
    expect(findPinnedAddress('Caseros 2500')).toBeNull();
  });
});
