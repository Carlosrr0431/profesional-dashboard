const { selectNearestRing } = require('../../src/lib/dispatchBroadcast');

function driverAt(id, distanceKm) {
  return { driver: { id }, distanceKm, scoreKm: distanceKm };
}

describe('selectNearestRing', () => {
  it('ofrece a todos los choferes del anillo más cercano', () => {
    const ring = selectNearestRing(
      [driverAt('far', 2.4), driverAt('a', 0.4), driverAt('b', 0.9)],
      [1, 2, 3],
    );
    expect(ring.radiusKm).toBe(1);
    expect(ring.drivers.map((item) => item.driver.id).sort()).toEqual(['a', 'b']);
  });

  it('pasa al anillo siguiente si el más chico está vacío', () => {
    const ring = selectNearestRing(
      [driverAt('c', 1.8), driverAt('d', 1.4)],
      [1, 2, 3],
    );
    expect(ring.radiusKm).toBe(2);
    expect(ring.drivers).toHaveLength(2);
  });

  it('no devuelve nadie fuera de los radios permitidos', () => {
    expect(selectNearestRing([driverAt('x', 9)], [1, 2])).toBeNull();
  });
});
