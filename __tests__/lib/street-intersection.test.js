const {
  intersectionHitMatches,
  intersectionSearchLabel,
  parseStreetIntersection,
} = require('../../shared/salta-address');

describe('intersección de calles', () => {
  it('detecta bolivar y belgrano y arma la búsqueda con la avenida', () => {
    const parsed = parseStreetIntersection('bolivar y belgrano');
    expect(parsed).toEqual({ street1: 'bolivar', street2: 'belgrano' });
    expect(intersectionSearchLabel(parsed)).toMatch(/belgrano/i);
    expect(intersectionSearchLabel(parsed)).toMatch(/y/i);
  });

  it('acepta el cruce y descarta un local sobre una sola calle', () => {
    expect(intersectionHitMatches({
      title: 'Simón Bolívar y Avenida Belgrano',
      types: ['intersection'],
      address: 'Simón Bolívar y Avenida Belgrano, Salta',
    }, 'bolivar', 'belgrano')).toBe(true);

    expect(intersectionHitMatches({
      title: 'Dentista Mabel y Patricia Aban',
      subtitle: 'Calle Simón Bolívar 407, Salta',
      address: 'Dentista Mabel y Patricia Aban, Calle Simón Bolívar 407, Salta',
    }, 'bolivar', 'belgrano')).toBe(false);
  });
});
