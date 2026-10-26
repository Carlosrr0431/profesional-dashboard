const { reverseHitIsPrecise } = require('../../shared/geo/nominatim');
const { labelForExactMapPick } = require('../../src/lib/mapPointPick');

describe('pin exacto del mapa', () => {
  it('un barrio no reemplaza el punto elegido', () => {
    expect(reverseHitIsPrecise({
      osmType: 'suburb',
      lat: -24.82198,
      lng: -65.43502,
      address: { suburb: 'Atocha' },
    }, -24.82198, -65.43502)).toBe(false);

    expect(labelForExactMapPick({
      precise: false,
      formattedAddress: 'Bº Atocha 1, Bº Atocha 1, General Alvarado',
    }, -24.82198, -65.43502)).toBe('-24.82198, -65.43502');
  });

  it('una calle con altura junto al clic sí se puede nombrar, sin mover el pin', () => {
    expect(reverseHitIsPrecise({
      osmType: 'house',
      lat: -24.78681,
      lng: -65.40449,
      address: { road: 'Güemes', house_number: '150' },
    }, -24.78681, -65.40449)).toBe(true);

    expect(labelForExactMapPick({
      precise: true,
      formattedAddress: 'Güemes 150, Salta',
    }, -24.78681, -65.40449)).toBe('Güemes 150, Salta');
  });
});
