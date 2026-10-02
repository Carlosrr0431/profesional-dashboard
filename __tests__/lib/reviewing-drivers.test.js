const { mapReviewingDrivers } = require('../../src/lib/reviewingDrivers');

describe('mapReviewingDrivers', () => {
  const juan = { id: 'a', full_name: 'Juan Pérez', photo_url: 'https://img/juan.jpg', phone: '387' };
  const ana = { id: 'b', full_name: 'Ana', photo_url: '', vehicle_model: 'Etios' };

  test('arma la lista pública en el orden de las ofertas', () => {
    const list = mapReviewingDrivers(['b', 'a', 'b'], [juan, ana], null);
    expect(list.map((driver) => driver.id)).toEqual(['b', 'a']);
    expect(list[0]).toEqual({
      id: 'b',
      full_name: 'Ana',
      photo_url: null,
      vehicle_brand: null,
      vehicle_model: 'Etios',
    });
    expect(list[1].photo_url).toBe('https://img/juan.jpg');
    expect(list[1].phone).toBeUndefined();
  });

  test('incluye al chofer asignado si la oferta todavía no está en la tabla', () => {
    const list = mapReviewingDrivers([], [juan], 'a');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('a');
    expect(list[0].full_name).toBe('Juan Pérez');
  });

  test('no inventa choferes sin fila', () => {
    expect(mapReviewingDrivers(['missing'], [], null)).toEqual([]);
  });
});