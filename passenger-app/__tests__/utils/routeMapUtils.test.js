const {
  haversineMeters,
  snapToRoute,
  splitRouteAtPoint,
  getBearing,
  getPointAheadOnRoute,
  dedupeRouteCoords,
  buildPassengerRemainingPath,
} = require('../../src/utils/routeMapUtils');

describe('routeMapUtils', () => {
  const route = [
    { latitude: -24.78, longitude: -65.42 },
    { latitude: -24.781, longitude: -65.419 },
    { latitude: -24.782, longitude: -65.418 },
  ];

  it('haversineMeters returns finite distance for two points', () => {
    const d = haversineMeters(route[0], route[2]);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });

  it('splitRouteAtPoint divides traveled and remaining', () => {
    const mid = { latitude: -24.7805, longitude: -65.4195 };
    const { traveled, remaining } = splitRouteAtPoint(mid, route);
    expect(traveled.length).toBeGreaterThan(0);
    expect(remaining.length).toBeGreaterThan(0);
  });

  it('snapToRoute returns point on route when close', () => {
    const near = { latitude: -24.7801, longitude: -65.4198 };
    const snapped = snapToRoute(near, route);
    expect(snapped.latitude).toBeDefined();
    expect(snapped.longitude).toBeDefined();
  });

  it('getBearing returns angle in 0-360 range', () => {
    const bearing = getBearing(route[0], route[2]);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });

  it('getPointAheadOnRoute returns coordinate ahead on path', () => {
    const ahead = getPointAheadOnRoute(route[0], route, 50);
    expect(ahead.latitude).toBeDefined();
    expect(ahead.longitude).toBeDefined();
  });

  it('buildPassengerRemainingPath hides line when driver is very close', () => {
    const target = route[route.length - 1];
    const near = {
      latitude: target.latitude + 0.00008,
      longitude: target.longitude + 0.00008,
    };
    const path = buildPassengerRemainingPath(near, route, target);
    expect(path.length).toBe(0);
  });

  it('dedupeRouteCoords removes points closer than threshold', () => {
    const dense = [
      { latitude: 0, longitude: 0 },
      { latitude: 0.000001, longitude: 0 },
      { latitude: 0.01, longitude: 0 },
    ];
    const sparse = dedupeRouteCoords(dense, 1);
    expect(sparse.length).toBeLessThan(dense.length);
  });
});
