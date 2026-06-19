const { mapGeorefDireccion } = require('../../shared/geo/georef');

describe('georef', () => {
  it('descarta direcciones sin coordenadas reales (null no debe mapearse a 0,0)', () => {
    const mapped = mapGeorefDireccion({
      nomenclatura: 'AV BOLIVIA 200, Salta, Capital, Salta',
      altura: { valor: 200 },
      calle: { nombre: 'AV BOLIVIA' },
      localidad_censal: { nombre: 'Salta' },
      provincia: { nombre: 'Salta' },
      ubicacion: { lat: null, lon: null },
    });

    expect(mapped).toBeNull();
  });

  it('acepta coordenadas válidas de Salta', () => {
    const mapped = mapGeorefDireccion({
      nomenclatura: 'AV ENTRE RIOS 200, Salta, Capital, Salta',
      altura: { valor: 200 },
      calle: { nombre: 'AV ENTRE RIOS' },
      localidad_censal: { nombre: 'Salta' },
      provincia: { nombre: 'Salta' },
      ubicacion: { lat: -24.781482624, lon: -65.404901193 },
    });

    expect(mapped?.lat).toBeCloseTo(-24.781482624, 5);
    expect(mapped?.lng).toBeCloseTo(-65.404901193, 5);
  });
});
