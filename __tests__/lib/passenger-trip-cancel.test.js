const {
  isPassengerInitiatedCancellation,
  isOperatorInitiatedCancellation,
  buildPassengerCancelledTripUpdate,
  buildWhatsAppCancelledTripUpdate,
  WHATSAPP_CANCEL_REASON,
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

  it('detecta cancelación manual del operador y no la trata como del pasajero', () => {
    const reason = '[MANUAL_CANCEL] Cancelado por operador para pedir un viaje nuevo';
    expect(isOperatorInitiatedCancellation({ cancel_reason: reason })).toBe(true);
    expect(isPassengerInitiatedCancellation({ cancel_reason: reason })).toBe(false);
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

  it('buildWhatsAppCancelledTripUpdate conserva driver_id y limpia wa_context', () => {
    const payload = buildWhatsAppCancelledTripUpdate({
      status: 'accepted',
      driver_id: 'driver-wa-1',
    });
    expect(payload.status).toBe('cancelled');
    expect(payload.dispatch_status).toBe('cancelled');
    expect(payload.cancel_reason).toBe(WHATSAPP_CANCEL_REASON);
    expect(payload.wa_context).toBeNull();
    expect(payload.driver_id).toBeUndefined();
    expect(isPassengerInitiatedCancellation(payload)).toBe(true);
  });
});

describe('canRequeuePendingTrip', () => {
  it('no reencola si el pasajero canceló por WhatsApp', () => {
    expect(
      canRequeuePendingTrip({
        status: 'pending',
        cancel_reason: 'Pasajero canceló por WhatsApp',
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
