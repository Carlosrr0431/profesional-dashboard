const { pickPassengerFareRoute } = require('../../../shared/salta-route');

function makeRoute(distanceMeters, durationSeconds) {
  return {
    legs: [{
      distance: { value: distanceMeters, text: `${distanceMeters / 1000} km` },
      duration: { value: durationSeconds, text: `${Math.round(durationSeconds / 60)} min` },
    }],
  };
}

describe('pickPassengerFareRoute', () => {
  it('elige la ruta más corta cuando el tiempo es similar', () => {
    const longFast = makeRoute(18500, 21 * 60);
    const shortAlmostSame = makeRoute(12600, 22 * 60);

    const picked = pickPassengerFareRoute([longFast, shortAlmostSame]);
    expect(picked.legs[0].distance.value).toBe(12600);
  });

  it('mantiene la ruta más rápida si la corta es mucho más lenta', () => {
    const fast = makeRoute(18000, 20 * 60);
    const slowShort = makeRoute(12000, 40 * 60);

    const picked = pickPassengerFareRoute([fast, slowShort]);
    expect(picked.legs[0].distance.value).toBe(18000);
  });

  it('devuelve la única ruta si no hay alternativas', () => {
    const only = makeRoute(8000, 15 * 60);
    expect(pickPassengerFareRoute([only])).toBe(only);
  });
});
