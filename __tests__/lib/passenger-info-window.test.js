const {
  formatPickupAddress,
  getQueueStatusMeta,
  resolveOfferedDriver,
} = require('../../src/components/PassengerInfoWindow');
const { canManuallyAssignExistingTrip } = require('../../src/lib/assignExistingTrip');

describe('PassengerInfoWindow helpers', () => {
  it('acorta la dirección de retiro sin el código postal', () => {
    expect(formatPickupAddress('San Juan 1691, A4400 Salta')).toBe('San Juan 1691');
    expect(formatPickupAddress('Mitre 200, Salta')).toBe('Mitre 200, Salta');
    expect(formatPickupAddress('')).toBe('Sin dirección');
  });

  it('muestra el estado de espera del pin del mapa', () => {
    expect(getQueueStatusMeta('pending').label).toBe('Esperando aceptación');
    expect(getQueueStatusMeta('queued').label).toBe('En cola');
    expect(getQueueStatusMeta('scheduled').label).toBe('Programado');
  });

  it('resuelve el chofer al que ya se ofertó el viaje pendiente', () => {
    const drivers = [
      { id: 'd1', fullName: 'Ana', driverNumber: 12 },
      { id: 'd2', fullName: 'Beto', driverNumber: 55 },
    ];
    expect(resolveOfferedDriver({ driverId: 'd2' }, drivers).fullName).toBe('Beto');
    expect(resolveOfferedDriver({ driver_id: 'd1' }, drivers).driverNumber).toBe(12);
    expect(resolveOfferedDriver({ status: 'queued' }, drivers)).toBeNull();
  });

  it('permite derivar desde el modal un viaje queued o pending', () => {
    expect(canManuallyAssignExistingTrip({ id: 't1', status: 'pending' })).toBe(true);
    expect(canManuallyAssignExistingTrip({ id: 't2', status: 'queued' })).toBe(true);
    expect(canManuallyAssignExistingTrip({ id: 't3', status: 'scheduled' })).toBe(true);
    expect(canManuallyAssignExistingTrip({ id: 't4', status: 'accepted' })).toBe(false);
  });
});
