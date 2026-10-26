const {
  alignStreetNumberPins,
  intersectionHitMatches,
  intersectionSearchLabel,
  parseStreetIntersection,
} = require('../../shared/salta-address');

describe('intersección de calles', () => {
  it('detecta bolivar y belgrano y arma la búsqueda con la avenida', () => {
    const parsed = parseStreetIntersection('bolivar y belgrano');
    expect(parsed).toEqual({ street1: 'bolivar', street2: 'belgrano' });
    expect(intersectionSearchLabel(parsed)).toMatch(/belgrano/i);
    expect(intersectionSearchLabel(parsed)).toMatch(/simon bolivar/i);
  });

  it('corre el pin de la altura cuando ya hay un lugar en esa misma calle y número', () => {
    const items = alignStreetNumberPins([
      {
        placeId: 'google:experta',
        title: 'Experta Seguros Salta',
        subtitle: 'Gral. Martín Güemes 150',
        lat: -24.7868111,
        lng: -65.404488,
      },
      {
        placeId: 'georef:-24.7868575,-65.4005672',
        title: 'GRL MARTIN MIGUEL DE GUEMES 150',
        address: 'GRL MARTIN MIGUEL DE GUEMES 150, Salta',
        lat: -24.7868575,
        lng: -65.4005672,
      },
      {
        placeId: 'georef:-24.7874101,-65.4177627',
        title: 'DR ADOLFO GUEMES 150',
        address: 'DR ADOLFO GUEMES 150, Salta',
        lat: -24.7874101,
        lng: -65.4177627,
      },
    ], 'general guemes 150');

    expect(items[1].lng).toBeCloseTo(-65.404488, 4);
    expect(items[1].lat).toBeCloseTo(-24.7868111, 4);
    expect(items[2].lng).toBeCloseTo(-65.4177627, 4);
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
