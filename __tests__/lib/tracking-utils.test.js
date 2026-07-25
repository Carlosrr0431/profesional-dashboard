import {
  resolveTrackingPickup,
  resolveTrackingDropoff,
  resolveTrackingRouteTarget,
  splitRouteAtPoint,
  haversineMeters,
} from '../../app/seguimiento/[token]/trackingUtils';

describe('trackingUtils — pins y ruta restante', () => {
  const tripWithOrigin = {
    status: 'going_to_pickup',
    origin_lat: -24.78,
    origin_lng: -65.42,
    origin_address: 'Retiro Centro',
    destination_lat: -24.79,
    destination_lng: -65.43,
    destination_address: 'Destino Norte',
  };

  const legacyWhatsappTrip = {
    status: 'going_to_pickup',
    origin_lat: null,
    origin_lng: null,
    origin_address: null,
    destination_lat: -24.785,
    destination_lng: -65.411,
    destination_address: 'Bernardino Rivadavia 1403',
  };

  it('resuelve pin de origen desde origin_*', () => {
    const pickup = resolveTrackingPickup(tripWithOrigin);
    expect(pickup).toEqual({
      lat: -24.78,
      lng: -65.42,
      address: 'Retiro Centro',
    });
  });

  it('resuelve pin de origen legacy desde destination_*', () => {
    const pickup = resolveTrackingPickup(legacyWhatsappTrip);
    expect(pickup).toEqual({
      lat: -24.785,
      lng: -65.411,
      address: 'Bernardino Rivadavia 1403',
    });
  });

  it('prioriza pickup enriquecido de la API', () => {
    const pickup = resolveTrackingPickup(legacyWhatsappTrip, {
      lat: -24.781,
      lng: -65.42,
      address: 'Desde API',
    });
    expect(pickup.address).toBe('Desde API');
    expect(pickup.lat).toBe(-24.781);
  });

  it('elige retiro como target en going_to_pickup', () => {
    const pickup = resolveTrackingPickup(tripWithOrigin);
    const dropoff = resolveTrackingDropoff(tripWithOrigin);
    const target = resolveTrackingRouteTarget(tripWithOrigin, pickup, dropoff);
    expect(target).toEqual(pickup);
  });

  it('elige destino como target en in_progress', () => {
    const trip = { ...tripWithOrigin, status: 'in_progress' };
    const pickup = resolveTrackingPickup(trip);
    const dropoff = resolveTrackingDropoff(trip);
    const target = resolveTrackingRouteTarget(trip, pickup, dropoff);
    expect(target).toEqual(dropoff);
  });

  it('recorta la polilínea adelante del chofer', () => {
    const route = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
      { lat: 0, lng: 0.003 },
    ];
    const atSecond = { lat: 0, lng: 0.001 };
    const { remaining } = splitRouteAtPoint(atSecond, route);
    expect(remaining.length).toBeGreaterThanOrEqual(2);
    expect(remaining[0].lng).toBeCloseTo(0.001, 5);
    expect(remaining[remaining.length - 1].lng).toBeCloseTo(0.003, 5);
    expect(haversineMeters(remaining[0], remaining[remaining.length - 1]))
      .toBeLessThan(haversineMeters(route[0], route[route.length - 1]));
  });
});
