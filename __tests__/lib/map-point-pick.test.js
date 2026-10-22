const {
  MAP_PICK_SOURCE,
  extractMapClickLngLat,
  formatPickedCoordsLabel,
  validateMapPickInSalta,
  buildMapPickedPlace,
  mapPickModeLabel,
  geocodeSourceBadge,
} = require('../../src/lib/mapPointPick');

describe('mapPointPick', () => {
  it('lee lat/lng del clic de MapLibre como { latitude, longitude }', () => {
    expect(extractMapClickLngLat({
      lngLat: { lat: -24.7821, lng: -65.4232 },
    })).toEqual({ latitude: -24.7821, longitude: -65.4232 });
    expect(extractMapClickLngLat({
      latlng: { lat: -24.7821, lng: -65.4232 },
    })).toEqual({ latitude: -24.7821, longitude: -65.4232 });
    expect(extractMapClickLngLat({})).toBeNull();
    expect(extractMapClickLngLat(null)).toBeNull();
  });

  it('formatea coordenadas para mostrarlas en el formulario', () => {
    expect(formatPickedCoordsLabel(-24.78219, -65.42321)).toBe('-24.78219, -65.42321');
    expect(formatPickedCoordsLabel('x', -65)).toBe('');
  });

  it('acepta Capital, Vaqueros y Campo Quijano, y rechaza Jujuy', () => {
    expect(validateMapPickInSalta(-24.7821, -65.4232).ok).toBe(true);
    expect(validateMapPickInSalta(-24.695, -65.41).ok).toBe(true);
    expect(validateMapPickInSalta(-24.91, -65.64).ok).toBe(true);
    expect(validateMapPickInSalta(-24.19, -65.30).ok).toBe(false);
    expect(validateMapPickInSalta(-24.19, -65.30).message).toMatch(/cobertura/);
  });

  it('arma el place del mapa con reverse geocode o con las coordenadas', () => {
    const withAddress = buildMapPickedPlace({
      lat: -24.7821,
      lng: -65.4232,
      reverse: {
        formattedAddress: 'Belgrano 1200, Salta',
        title: 'Belgrano 1200',
        geocodeSource: 'address_geocode',
      },
    });
    expect(withAddress.formattedAddress).toBe('Belgrano 1200, Salta');
    expect(withAddress.geocodeSource).toBe(MAP_PICK_SOURCE);

    const fallback = buildMapPickedPlace({ lat: -24.7821, lng: -65.4232 });
    expect(fallback.formattedAddress).toBe('-24.78210, -65.42320');
    expect(fallback.geocodeSource).toBe(MAP_PICK_SOURCE);
  });

  it('explica el modo de marcado y el origen de las coordenadas', () => {
    expect(mapPickModeLabel('origin')).toMatch(/origen/);
    expect(mapPickModeLabel('dest')).toMatch(/destino/);
    expect(geocodeSourceBadge('map_pick').label).toBe('Mapa GPS');
    expect(geocodeSourceBadge('supabase_cache').label).toBe('cache BD');
    expect(geocodeSourceBadge('google_places').label).toBe('Google');
  });
});
