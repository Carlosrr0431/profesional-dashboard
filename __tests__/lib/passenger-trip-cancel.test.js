const {
  isPassengerInitiatedCancellation,
  isOperatorInitiatedCancellation,
  buildPassengerCancelledTripUpdate,
  buildWhatsAppCancelledTripUpdate,
  buildOperatorCancelledTripUpdate,
  canOperatorCancelTrip,
  WHATSAPP_CANCEL_REASON,
  OPERATOR_CANCEL_REASON,
} = require('../../src/lib/passengerTripCancel');
const { canRequeuePendingTrip } = require('../../src/lib/tripRequeue');
const { cancelTripAsOperator } = require('../../src/lib/cancelTripAsOperator');

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

  it('no reencola si el operador canceló el viaje', () => {
    expect(
      canRequeuePendingTrip({
        status: 'pending',
        cancel_reason: '[MANUAL_CANCEL] Cancelado por operador',
      })
    ).toBe(false);
  });
});

describe('operator cancel', () => {
  it('buildOperatorCancelledTripUpdate marca dispatch y conserva chofer en pending', () => {
    const payload = buildOperatorCancelledTripUpdate({
      status: 'pending',
      driver_id: 'driver-1',
    });
    expect(payload.status).toBe('cancelled');
    expect(payload.dispatch_status).toBe('cancelled');
    expect(payload.cancel_reason).toBe(OPERATOR_CANCEL_REASON);
    expect(payload.driver_id).toBeUndefined();
    expect(isOperatorInitiatedCancellation(payload)).toBe(true);
  });

  it('libera driver_id si el viaje estaba en cola sin asignación real', () => {
    const payload = buildOperatorCancelledTripUpdate({ status: 'queued' });
    expect(payload.driver_id).toBeNull();
  });

  it('canOperatorCancelTrip permite cola, pending y going_to_pickup, no un viaje en curso', () => {
    expect(canOperatorCancelTrip({ status: 'queued' })).toBe(true);
    expect(canOperatorCancelTrip({ status: 'pending' })).toBe(true);
    expect(canOperatorCancelTrip({ status: 'scheduled' })).toBe(true);
    expect(canOperatorCancelTrip({ status: 'going_to_pickup' })).toBe(true);
    expect(canOperatorCancelTrip({ status: 'accepted' })).toBe(false);
    expect(canOperatorCancelTrip({ status: 'in_progress' })).toBe(false);
  });

  it('cancelTripAsOperator actualiza el viaje y lo saca de la cola', async () => {
    const existing = { id: 't1', status: 'queued', driver_id: null };
    const updated = {
      id: 't1',
      status: 'cancelled',
      dispatch_status: 'cancelled',
      cancel_reason: OPERATOR_CANCEL_REASON,
      driver_id: null,
    };
    const calls = [];
    const makeQuery = (result) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        update: (payload) => {
          calls.push({ type: 'update', payload });
          return query;
        },
        delete: () => {
          calls.push({ type: 'delete' });
          return query;
        },
        maybeSingle: () => Promise.resolve(result),
      };
      return query;
    };

    let fromCount = 0;
    const supabase = {
      from: (table) => {
        fromCount += 1;
        calls.push({ type: 'from', table });
        if (fromCount === 1) return makeQuery({ data: existing, error: null });
        if (fromCount === 2) return makeQuery({ data: updated, error: null });
        return makeQuery({ data: null, error: null });
      },
    };

    const result = await cancelTripAsOperator(supabase, 't1');
    expect(result.alreadyCancelled).toBe(false);
    expect(result.trip.status).toBe('cancelled');
    expect(calls.some((item) => item.type === 'delete')).toBe(true);
    expect(calls.find((item) => item.type === 'update')?.payload.dispatch_status).toBe('cancelled');
  });

  it('cancelTripAsOperator rechaza viajes ya aceptados', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({
        data: { id: 't2', status: 'accepted', driver_id: 'd1' },
        error: null,
      }),
    };
    const supabase = { from: () => query };
    await expect(cancelTripAsOperator(supabase, 't2')).rejects.toMatchObject({
      code: 'not_cancellable',
    });
  });
});
