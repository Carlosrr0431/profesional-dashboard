const { installGeoFetchMock } = require('../helpers/geo-fetch-mock');
const {
  autocompleteAndResolveAddresses,
  geocodeAddressViaPlaces,
} = require('../../src/lib/geo/placesAutocompleteResolve.js');

describe('placesAutocompleteResolve', () => {
  beforeEach(() => {
    installGeoFetchMock();
  });

  it('resuelve Mitre 200 con coords vía autocomplete + Place Details', async () => {
    const hits = await autocompleteAndResolveAddresses('Mitre 200', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].lat).toBeCloseTo(-24.7874909, 3);
    expect(hits[0].lng).toBeCloseTo(-65.4107292, 3);
    expect(/mitre/i.test(hits[0].formattedAddress)).toBe(true);
  });

  it('geocodeAddressViaPlaces devuelve el primer hit resuelto', async () => {
    const geo = await geocodeAddressViaPlaces('Chacabuco 350, Salta');
    expect(geo.lat).toBeCloseTo(-24.7889, 3);
    expect(/chacabuco/i.test(geo.formattedAddress)).toBe(true);
  });
});
