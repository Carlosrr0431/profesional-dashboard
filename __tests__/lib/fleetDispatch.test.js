import {
  buildFleetActiveTripByRoot,
  expandBusyDriverIdsToFleet,
  getFleetRootId,
  resolveDisplayActiveTrip,
  resolveFleetActiveTrip,
} from '../../src/lib/fleetDispatch';

describe('fleetDispatch', () => {
  const owner = { id: 'owner-1', owner_id: null, is_assigned_driver: false };
  const assigned = { id: 'a1', owner_id: 'owner-1', is_assigned_driver: true };

  it('resuelve la raíz del móvil', () => {
    expect(getFleetRootId(owner)).toBe('owner-1');
    expect(getFleetRootId(assigned)).toBe('owner-1');
  });

  it('expande ocupación a todo el móvil', () => {
    const expanded = expandBusyDriverIdsToFleet(
      [owner, assigned],
      new Set(['a1']),
    );
    expect(expanded.has('a1')).toBe(true);
    expect(expanded.has('owner-1')).toBe(true);
  });

  it('agrupa viaje activo por móvil para lógica de flota', () => {
    const trip = {
      driver_id: 'a1',
      status: 'in_progress',
      passenger_name: 'María',
      destination_address: 'Centro',
    };
    const byRoot = buildFleetActiveTripByRoot([owner, assigned], [trip]);
    expect(resolveFleetActiveTrip(owner, byRoot)).toEqual(trip);
    expect(resolveFleetActiveTrip(assigned, byRoot)).toEqual(trip);
  });

  it('solo muestra viaje activo en UI al chofer que lo realiza', () => {
    const trip = {
      driver_id: 'a1',
      status: 'going_to_pickup',
      passenger_name: 'Carlos',
      destination_address: 'Juan Gálvez 1000',
    };
    const activeTripsMap = { a1: trip };
    expect(resolveDisplayActiveTrip('a1', activeTripsMap)).toEqual(trip);
    expect(resolveDisplayActiveTrip('owner-1', activeTripsMap)).toBeNull();
  });
});
