const {
  canManuallyAssignExistingTrip,
  isFreeDashboardDriver,
  listFreeDashboardDrivers,
  buildAssignExistingTripUpdate,
  hasValidDriverGps,
} = require('../../src/lib/assignExistingTrip');

describe('assignExistingTrip', () => {
  it('permite asignar scheduled, queued y pending, no accepted', () => {
    expect(canManuallyAssignExistingTrip({ status: 'scheduled' })).toBe(true);
    expect(canManuallyAssignExistingTrip({ status: 'queued' })).toBe(true);
    expect(canManuallyAssignExistingTrip({ status: 'pending' })).toBe(true);
    expect(canManuallyAssignExistingTrip({ status: 'accepted' })).toBe(false);
    expect(canManuallyAssignExistingTrip({ status: 'cancelled' })).toBe(false);
  });

  it('lista solo choferes online, sin bloqueo y sin viaje activo', () => {
    const drivers = [
      { id: 'a', isOnline: true, dispatchBlocked: false, activeTrip: null, fullName: 'Ana', driverNumber: 2 },
      { id: 'b', isOnline: false, dispatchBlocked: false, activeTrip: null, fullName: 'Beto', driverNumber: 1 },
      { id: 'c', isOnline: true, dispatchBlocked: true, activeTrip: null, fullName: 'Cata', driverNumber: 3 },
      { id: 'd', isOnline: true, dispatchBlocked: false, activeTrip: { id: 't1' }, fullName: 'Dami', driverNumber: 4 },
      { id: 'e', isOnline: true, dispatchBlocked: false, activeTrip: null, fullName: 'Eva', driverNumber: 1 },
    ];

    expect(isFreeDashboardDriver(drivers[0])).toBe(true);
    expect(listFreeDashboardDrivers(drivers).map((d) => d.id)).toEqual(['e', 'a']);
  });

  it('no pisa origin_* en viajes de passenger-app y sí usa GPS en legacy', () => {
    const driver = { id: 'drv-1', current_lat: -24.78, current_lng: -65.42 };
    const assignedAt = '2026-08-31T22:00:00.000Z';

    const preserved = buildAssignExistingTripUpdate({
      trip: { notes: '[PASSENGER_APP]', origin_address: 'Mitre 200', origin_lat: -24.79, origin_lng: -65.41 },
      driver,
      assignedAt,
    });
    expect(preserved).toEqual({
      driver_id: 'drv-1',
      status: 'pending',
      assigned_at: assignedAt,
      dispatch_status: 'waiting_acceptance',
    });

    const legacy = buildAssignExistingTripUpdate({
      trip: { notes: '', origin_address: null, origin_lat: null, origin_lng: null },
      driver,
      assignedAt,
    });
    expect(legacy.origin_lat).toBe(-24.78);
    expect(legacy.origin_lng).toBe(-65.42);
    expect(legacy.origin_address).toMatch(/-24\.78000/);
  });

  it('detecta GPS inválido en 0,0', () => {
    expect(hasValidDriverGps({ current_lat: 0, current_lng: 0 })).toBe(false);
    expect(hasValidDriverGps({ lat: -24.7, lng: -65.4 })).toBe(true);
  });
});
