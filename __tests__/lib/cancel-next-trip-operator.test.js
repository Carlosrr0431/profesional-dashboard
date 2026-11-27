const send = jest.fn(async () => 'msg-id');

jest.mock('../../src/lib/firebaseAdmin', () => ({
  getFirebaseMessagingClient: () => ({ send }),
  isLegacyExpoPushToken: () => false,
  isLikelyFcmToken: () => true,
  buildAndroidNotificationTag: () => 'tag',
  normalizeFcmDataPayload: (data) => data,
  normalizeFirebaseSendError: () => ({ reason: 'push_error' }),
}));

jest.mock('../../src/lib/passengerPushNotifications', () => ({
  trySendPassengerAppTripPush: jest.fn(async () => ({ ok: true })),
}));

const {
  canOperatorCancelTrip,
  getOperatorCancellableStatuses,
  OPERATOR_CANCEL_REASON,
} = require('../../src/lib/passengerTripCancel');
const { cancelTripAsOperator, OPERATOR_CANCEL_TRIP_SELECT } = require('../../src/lib/cancelTripAsOperator');
const { notifyOperatorCancelledTrip } = require('../../src/lib/notifyOperatorCancelledTrip');

const RESERVED_NEXT = {
  id: 'next-1',
  status: 'accepted',
  driver_id: 'driver-busy',
  next_after_trip_id: 'live-1',
};

describe('el operador puede cancelar el siguiente viaje de un móvil ocupado', () => {
  it('permite cancelar un siguiente viaje ya aceptado', () => {
    expect(canOperatorCancelTrip(RESERVED_NEXT)).toBe(true);
    expect(getOperatorCancellableStatuses(RESERVED_NEXT)).toContain('accepted');
  });

  it('también el que todavía está en confirmación', () => {
    expect(canOperatorCancelTrip({ ...RESERVED_NEXT, status: 'pending' })).toBe(true);
  });

  it('un viaje aceptado común (sin siguiente) sigue sin poder cancelarse', () => {
    expect(canOperatorCancelTrip({ id: 't', status: 'accepted', driver_id: 'd1' })).toBe(false);
    expect(canOperatorCancelTrip({ id: 't', status: 'accepted', next_after_trip_id: '' })).toBe(false);
    expect(canOperatorCancelTrip({ id: 't', status: 'accepted', next_after_trip_id: null })).toBe(false);
  });

  it('el estado de cancelación no se amplía para el resto de los viajes', () => {
    expect(getOperatorCancellableStatuses({ id: 't', status: 'accepted' })).not.toContain('accepted');
  });

  it('la consulta trae el dato del siguiente viaje para poder decidirlo', () => {
    expect(OPERATOR_CANCEL_TRIP_SELECT).toContain('next_after_trip_id');
  });
});

describe('cancelTripAsOperator con un siguiente viaje reservado', () => {
  function makeSupabase(existing, updated) {
    const calls = { update: null, inStatuses: null, deleted: false };
    let reads = 0;
    const makeQuery = (result) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: (_column, statuses) => {
          calls.inStatuses = statuses;
          return query;
        },
        update: (payload) => {
          calls.update = payload;
          return query;
        },
        delete: () => {
          calls.deleted = true;
          return query;
        },
        maybeSingle: () => Promise.resolve(result),
      };
      return query;
    };
    const supabase = {
      from: () => makeQuery(reads++ === 0
        ? { data: existing, error: null }
        : { data: updated, error: null }),
    };
    return { supabase, calls };
  }

  it('lo cancela, lo saca de la cola y conserva al chofer para que le llegue el aviso', async () => {
    const updated = { ...RESERVED_NEXT, status: 'cancelled', cancel_reason: OPERATOR_CANCEL_REASON };
    const { supabase, calls } = makeSupabase(RESERVED_NEXT, updated);

    const result = await cancelTripAsOperator(supabase, 'next-1');

    expect(result.alreadyCancelled).toBe(false);
    expect(result.trip.status).toBe('cancelled');
    expect(calls.update.status).toBe('cancelled');
    expect(calls.update.cancel_reason).toBe(OPERATOR_CANCEL_REASON);
    expect(calls.update.driver_id).toBeUndefined();
    expect(calls.inStatuses).toContain('accepted');
    expect(calls.deleted).toBe(true);
  });

  it('un viaje aceptado común se rechaza igual que antes', async () => {
    const { supabase } = makeSupabase({ id: 't2', status: 'accepted', driver_id: 'd1' }, null);
    await expect(cancelTripAsOperator(supabase, 't2')).rejects.toMatchObject({ code: 'not_cancellable' });
  });
});

describe('aviso al chofer cuando se cancela', () => {
  const supabase = {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: { id: 'driver-busy', push_token: 'token-fcm' }, error: null }),
      };
      return query;
    },
  };

  beforeEach(() => send.mockClear());

  it('si era el siguiente viaje, aclara que sigue con el actual', async () => {
    await notifyOperatorCancelledTrip(supabase, { ...RESERVED_NEXT, status: 'cancelled' });
    const { notification } = send.mock.calls[0][0];
    expect(notification.title).toBe('Siguiente viaje cancelado');
    expect(notification.body).toMatch(/seguí con el viaje actual/i);
  });

  it('un viaje común mantiene el aviso de siempre', async () => {
    await notifyOperatorCancelledTrip(supabase, { id: 't9', status: 'cancelled', driver_id: 'driver-busy' });
    const { notification } = send.mock.calls[0][0];
    expect(notification.title).toBe('Viaje cancelado');
    expect(notification.body).toBe('La central canceló el viaje.');
  });
});
