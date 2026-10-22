import {
  isWithinDriverSearchRadius,
  queuedTripIdsNearFreeDrivers,
} from '../../src/lib/dispatchSearchRadius';

describe('radio de búsqueda de choferes', () => {
  test('2 km entra y 2.1 km no', () => {
    expect(isWithinDriverSearchRadius(2)).toBe(true);
    expect(isWithinDriverSearchRadius(2.1)).toBe(false);
  });

  test('un chofer que se libera dentro de 2 km despierta solo ese viaje', () => {
    const ids = queuedTripIdsNearFreeDrivers({
      trips: [{ id: 'cerca' }, { id: 'lejos' }, { id: 'excluido' }],
      freeDrivers: [{ id: 'libre' }],
      pickupOf: (trip) => ({
        lat: trip.id === 'lejos' ? 3.1 : trip.id === 'excluido' ? 0.4 : 1.2,
        lng: 0,
      }),
      excludedIdsOf: (trip) => new Set(trip.id === 'excluido' ? ['libre'] : []),
      samePhone: () => false,
      distanceKm: (_driver, pickupLat) => pickupLat,
    });
    expect(ids).toEqual(['cerca']);
  });

  test('no despierta el viaje si el chofer libre está a más de 2 km', () => {
    const ids = queuedTripIdsNearFreeDrivers({
      trips: [{ id: 'lejos' }],
      freeDrivers: [{ id: 'libre' }],
      pickupOf: () => ({ lat: 1, lng: 1 }),
      excludedIdsOf: () => new Set(),
      samePhone: () => false,
      distanceKm: () => 3.4,
    });
    expect(ids).toEqual([]);
  });
});
