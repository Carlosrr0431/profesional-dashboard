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
});
