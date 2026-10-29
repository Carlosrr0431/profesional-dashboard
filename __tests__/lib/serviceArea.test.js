const {
  isWithinSaltaCapital,
  isWithinServiceArea,
  coordsAllowedForQuery,
} = require('../../shared/geo/mapConfig');

describe('zona de cobertura del valle', () => {
  test('Vaqueros y Campo Quijano entran en la cobertura y no en el casco', () => {
    expect(isWithinServiceArea(-24.695, -65.41)).toBe(true);
    expect(isWithinSaltaCapital(-24.695, -65.41)).toBe(false);
    expect(isWithinServiceArea(-24.91, -65.64)).toBe(true);
    expect(isWithinSaltaCapital(-24.91, -65.64)).toBe(false);
  });

  test('una calle ambigua no acepta coordenadas de Vaqueros', () => {
    expect(coordsAllowedForQuery(-24.695, -65.41, 'guemes 700')).toBe(false);
  });

  test('si el pedido nombra Campo Quijano, usa esas coordenadas', () => {
    expect(coordsAllowedForQuery(-24.91, -65.64, 'Campo Quijano')).toBe(true);
    expect(coordsAllowedForQuery(-31.42, -64.18, 'Campo Quijano')).toBe(false);
  });

  test('Cafayate entra si el pedido la nombra; Orán y Tartagal no', () => {
    expect(isWithinServiceArea(-26.073, -65.976)).toBe(true);
    expect(coordsAllowedForQuery(-26.073, -65.976, 'belgrano 50 cafayate')).toBe(true);
    expect(coordsAllowedForQuery(-26.073, -65.976, 'belgrano 50')).toBe(false);
    expect(isWithinServiceArea(-22.516, -63.801)).toBe(false);
    expect(coordsAllowedForQuery(-22.516, -63.801, 'san martin 100 tartagal')).toBe(false);
    expect(coordsAllowedForQuery(-23.137, -64.324, 'san martin 100 oran')).toBe(false);
    expect(coordsAllowedForQuery(-24.67, -65.05, 'guemes 700')).toBe(false);
    expect(coordsAllowedForQuery(-24.67, -65.05, 'general guemes')).toBe(true);
  });

  test('San Martín de Vaqueros no usa la avenida homónima de Capital', () => {
    expect(coordsAllowedForQuery(-24.79395, -65.40589, 'san martin 200 vaqueros')).toBe(false);
    expect(coordsAllowedForQuery(-24.70794, -65.40818, 'san martin 200 vaqueros')).toBe(true);
    expect(coordsAllowedForQuery(-24.60111, -65.37426, 'san martin 300 vaqueros')).toBe(false);
  });

  test('0,0 no es un punto de Salta', () => {
    const { hasUsableGeoPoint, omitUnusablePin } = require('../../shared/geo/mapConfig');
    expect(hasUsableGeoPoint(0, 0)).toBe(false);
    expect(hasUsableGeoPoint(-24.803845, -65.416734)).toBe(true);
    expect(omitUnusablePin({ title: 'Avenida Chile 800', lat: 0, lng: 0 }).lat).toBeUndefined();
  });
});
