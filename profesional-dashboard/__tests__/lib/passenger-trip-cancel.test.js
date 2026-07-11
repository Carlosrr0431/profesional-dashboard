const {
  isPassengerInitiatedCancellation,
  buildPassengerCancelledTripUpdate,
} = require('../../src/lib/passengerTripCancel');
const { canRequeuePendingTrip } = require('../../src/lib/tripRequeue');

describe('passengerTripCancel', () => {
  it('detecta cancelación desde la app de pasajeros', () => {
    expect(
      isPassengerInitiatedCancellation({
        cancel_reason: '[PASSENGER_APP] Cancelado por el pasajero',
      })
    ).toBe(true);
  });

  it('buildPassengerCancelledTripUpdate marca dispatch cancelado', () => {
    const payload = buildPassengerCancelledTripUpdate({ status: 'queued' });
    expect(payload.status).toBe('cancelled');
    expect(payload.dispatch_status).toBe('cancelled');
    expect(payload.driver_id).toBeNull();
  });

  it('conserva driver_id si el viaje ya estaba asignado', () => {
    const payload = buildPassengerCancelledTripUpdate({
      status: 'going_to_pickup',
      driver_id: 'driver-1',
    });
    expect(payload.status).toBe('cancelled');
    expect(payload.driver_id).toBeUndefined();
  });
});

describe('canRequeuePendingTrip', () => {
  it('no reencola si el pasajero canceló', () => {
    expect(
      canRequeuePendingTrip({
        status: 'pending',
        cancel_reason: '[PASSENGER_APP] Cancelado por el pasajero',
      })
    ).toBe(false);
  });

  it('permite reencolar pending sin cancelación del pasajero', () => {
    expect(
      canRequeuePendingTrip({
        status: 'pending',
        cancel_reason: '[AUTO_REQUEUE] Sin respuesta del chofer',
      })
    ).toBe(true);
  });
});
