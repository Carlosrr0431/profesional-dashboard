/** @jest-environment node */

const mockValidatePassengerSession = jest.fn();
const mockCreateClient = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClient(...args),
}));

jest.mock('../../src/lib/passengerOtp', () => ({
  validatePassengerSession: (...args) => mockValidatePassengerSession(...args),
}));

const OWNER_PHONE = '3878630173';

/** Supabase mínimo: devuelve `tripRow` y registra los UPDATE sobre trips. */
function makeSupabase(tripRow) {
  const updates = [];
  const client = {
    from: jest.fn((table) => {
      if (table !== 'trips') {
        return { delete: () => ({ eq: async () => ({ error: null }) }) };
      }
      const state = { op: 'select' };
      const builder = {
        select: jest.fn(() => builder),
        update: jest.fn((payload) => {
          state.op = 'update';
          state.payload = payload;
          return builder;
        }),
        eq: jest.fn(() => builder),
        in: jest.fn((_column, values) => {
          state.statuses = values;
          return builder;
        }),
        maybeSingle: jest.fn(async () => ({ data: tripRow, error: null })),
        single: jest.fn(async () => {
          if (state.op !== 'update') return { data: tripRow, error: null };
          updates.push({ payload: state.payload, statuses: state.statuses });
          const stillMatches = state.statuses.includes(tripRow.status);
          return { data: stillMatches ? { ...tripRow, ...state.payload } : null, error: null };
        }),
      };
      return builder;
    }),
  };
  return { client, updates };
}

async function cancel(body) {
  const { POST } = await import('../../app/api/trips/cancel-passenger/route.js');
  const response = await POST(new Request('http://test/api/trips/cancel-passenger', {
    method: 'POST',
    body: JSON.stringify(body),
  }));
  return { status: response.status, payload: await response.json() };
}

describe('trips/cancel-passenger API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockValidatePassengerSession.mockReset();
    mockCreateClient.mockReset();
    process.env.SUPABASE_URL = 'http://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  });

  describe('viaje en curso (in_progress)', () => {
    const inProgress = {
      id: 'trip-1',
      status: 'in_progress',
      driver_id: 'drv-1',
      cancel_reason: null,
      passenger_phone: `+54 9 ${OWNER_PHONE}`,
    };

    it('lo cancela con la sesión del pasajero dueño y conserva al chofer', async () => {
      const { client, updates } = makeSupabase(inProgress);
      mockCreateClient.mockReturnValue(client);
      mockValidatePassengerSession.mockResolvedValue({ ok: true, phone: OWNER_PHONE });

      const { status, payload } = await cancel({
        tripId: 'trip-1',
        phone: OWNER_PHONE,
        sessionToken: 'tok-1',
      });

      expect(status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(updates).toHaveLength(1);
      expect(updates[0].statuses).toContain('in_progress');
      expect(updates[0].payload.status).toBe('cancelled');
      expect(updates[0].payload.cancel_reason).toMatch(/PASSENGER_APP/);
      // Conserva driver_id para que el chofer se entere por Realtime.
      expect(updates[0].payload).not.toHaveProperty('driver_id');
    });

    it('lo rechaza sin sesión: el tripId solo no alcanza (el link de seguimiento lo expone)', async () => {
      const { client, updates } = makeSupabase(inProgress);
      mockCreateClient.mockReturnValue(client);

      const { status, payload } = await cancel({ tripId: 'trip-1' });

      expect(status).toBe(403);
      expect(payload.ok).toBe(false);
      expect(payload.reason).toBe('forbidden');
      expect(updates).toHaveLength(0);
      expect(mockValidatePassengerSession).not.toHaveBeenCalled();
    });

    it('lo rechaza si la sesión no es válida', async () => {
      const { client, updates } = makeSupabase(inProgress);
      mockCreateClient.mockReturnValue(client);
      mockValidatePassengerSession.mockResolvedValue({ ok: false, status: 401, message: 'Sesión inválida.' });

      const { status } = await cancel({ tripId: 'trip-1', phone: OWNER_PHONE, sessionToken: 'vencido' });

      expect(status).toBe(403);
      expect(updates).toHaveLength(0);
    });

    it('lo rechaza si la sesión es de otro pasajero', async () => {
      const { client, updates } = makeSupabase(inProgress);
      mockCreateClient.mockReturnValue(client);
      mockValidatePassengerSession.mockResolvedValue({ ok: true, phone: '3875551234' });

      const { status } = await cancel({ tripId: 'trip-1', phone: '3875551234', sessionToken: 'tok-ajeno' });

      expect(status).toBe(403);
      expect(updates).toHaveLength(0);
    });
  });

  describe('estados anteriores (compatibilidad con apps viejas)', () => {
    it('sigue cancelando de camino al origen sin sesión', async () => {
      const { client, updates } = makeSupabase({
        id: 'trip-2',
        status: 'going_to_pickup',
        driver_id: 'drv-1',
        cancel_reason: null,
        passenger_phone: OWNER_PHONE,
      });
      mockCreateClient.mockReturnValue(client);

      const { status, payload } = await cancel({ tripId: 'trip-2' });

      expect(status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(mockValidatePassengerSession).not.toHaveBeenCalled();
      // Sin sesión el UPDATE no incluye in_progress: si el viaje pasa a "en curso" justo en
      // medio, no se cancela sin verificar al pasajero.
      expect(updates[0].statuses).toEqual(['queued', 'pending', 'going_to_pickup']);
    });

    it('si el viaje pasó a en curso entre la lectura y el UPDATE, no lo cancela', async () => {
      const row = {
        id: 'trip-3',
        status: 'going_to_pickup',
        driver_id: 'drv-1',
        cancel_reason: null,
        passenger_phone: OWNER_PHONE,
      };
      const { client } = makeSupabase(row);
      // La primera lectura ve going_to_pickup; el viaje pasa a in_progress antes del UPDATE.
      const originalFrom = client.from;
      client.from = jest.fn((table) => {
        const builder = originalFrom(table);
        if (table === 'trips' && builder.single) {
          const originalSingle = builder.single;
          builder.single = jest.fn(async () => {
            row.status = 'in_progress';
            return originalSingle();
          });
        }
        return builder;
      });
      mockCreateClient.mockReturnValue(client);

      const { status, payload } = await cancel({ tripId: 'trip-3' });

      expect(status).toBe(409);
      expect(payload.reason).toBe('not_cancellable');
    });

    it('no cancela un viaje ya completado', async () => {
      const { client, updates } = makeSupabase({
        id: 'trip-4',
        status: 'completed',
        driver_id: 'drv-1',
        cancel_reason: null,
        passenger_phone: OWNER_PHONE,
      });
      mockCreateClient.mockReturnValue(client);
      mockValidatePassengerSession.mockResolvedValue({ ok: true, phone: OWNER_PHONE });

      const { status, payload } = await cancel({
        tripId: 'trip-4',
        phone: OWNER_PHONE,
        sessionToken: 'tok-1',
      });

      expect(status).toBe(409);
      expect(payload.reason).toBe('not_cancellable');
      expect(updates).toHaveLength(0);
    });
  });

  it('no devuelve el teléfono del pasajero en una cancelación ya aplicada', async () => {
    const { client } = makeSupabase({
      id: 'trip-5',
      status: 'cancelled',
      driver_id: 'drv-1',
      cancel_reason: '[PASSENGER_APP] Cancelado por el pasajero',
      passenger_phone: OWNER_PHONE,
    });
    mockCreateClient.mockReturnValue(client);

    const { status, payload } = await cancel({ tripId: 'trip-5' });

    expect(status).toBe(200);
    expect(payload.alreadyCancelled).toBe(true);
    expect(payload.trip).not.toHaveProperty('passenger_phone');
  });

  it('exige el identificador del viaje', async () => {
    mockCreateClient.mockReturnValue(makeSupabase(null).client);
    const { status, payload } = await cancel({});
    expect(status).toBe(400);
    expect(payload.reason).toBe('missing_trip_id');
  });
});
