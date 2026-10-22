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
    expect(coordsAllowedForQuery(-24.19, -65.3, 'Campo Quijano')).toBe(false);
  });
});
