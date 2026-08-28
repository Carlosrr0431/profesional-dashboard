/**
 * poll-results-cancel.test.js
 *
 * Voto de la encuesta de confirmación de cancelación:
 * "Sí, cancelar" debe cancelar el viaje (conservando driver_id)
 * y "No, mantener el viaje" debe denegar sin cancelar.
 */

jest.mock('openai');
jest.mock('@supabase/supabase-js');

const { createOpenAIMock } = require('../helpers/openai-mock');
const { createQueryBuilder } = require('../helpers/supabase-mock');
const { makePostRequest, makePollResultEvent } = require('../helpers/request-factory');
const { WHATSAPP_CANCEL_REASON } = require('../../src/lib/passengerTripCancel');

const PHONE = '5493878630173';
const POLL_MSG_ID = 'poll-cancel-001';
const TRIP_ID = 'trip-cancel-1';
const DRIVER_ID = 'drv-cancel-1';

const OPEN_TRIP = {
  id: TRIP_ID,
  status: 'going_to_pickup',
  driver_id: DRIVER_ID,
  passenger_phone: PHONE,
  passenger_name: 'Pasajero Test',
  destination_address: 'Mitre 200, Salta',
  origin_address: 'Caseros 100, Salta',
  wa_context: {
    pending_cancel_confirm: true,
    cancel_poll_msg_id: POLL_MSG_ID,
    cancel_poll_wa_key_id: POLL_MSG_ID,
  },
};

let capturedTripUpdates = [];

function buildSupabaseMock() {
  return {
    from: jest.fn((tableName) => {
      if (tableName === 'whatsapp_conversations') {
        const builder = createQueryBuilder({
          data: {
            id: 'conv-cancel-1',
            phone: PHONE,
            push_name: 'Pasajero Test',
            context: {},
            last_trip_id: TRIP_ID,
          },
          error: null,
        });
        builder.update.mockImplementation(() => builder);
        return builder;
      }

      if (tableName === 'drivers') {
        return createQueryBuilder({
          data: {
            id: DRIVER_ID,
            full_name: 'Chofer Test',
            phone: '5493875550000',
            push_token: null,
          },
          error: null,
        });
      }

      if (tableName === 'settings') {
        return createQueryBuilder({ data: { value: 'true' }, error: null });
      }

      if (tableName === 'trips') {
        const builder = createQueryBuilder({ data: OPEN_TRIP, error: null });
        builder.update.mockImplementation((payload) => {
          capturedTripUpdates.push(payload);
          const after = createQueryBuilder({
            data: { id: TRIP_ID, ...payload },
            error: null,
          });
          builder.select.mockReturnValue(after);
          builder.eq.mockReturnValue(builder);
          builder.neq.mockReturnValue(builder);
          builder.maybeSingle.mockResolvedValue({ data: { id: TRIP_ID }, error: null });
          return builder;
        });
        return builder;
      }

      return createQueryBuilder({ data: null, error: null });
    }),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    })),
    removeChannel: jest.fn(),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://test.storage/file' } }),
      })),
    },
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: jest.fn().mockImplementation((fnName) => {
      if (fnName === 'append_whatsapp_message') {
        return Promise.resolve({
          data: [{ inserted: true, conversation_id: 'conv-cancel-1' }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
}

beforeEach(() => {
  capturedTripUpdates = [];
  jest.resetModules();
  const { createClient } = require('@supabase/supabase-js');
  const OpenAI = require('openai').default;
  createClient.mockReturnValue(buildSupabaseMock());
  OpenAI.mockImplementation(() => createOpenAIMock());
  ({ POST } = require('../../app/api/Agente_IA/route'));
});

afterEach(() => {
  jest.clearAllMocks();
});

let POST;

describe('poll.results -> confirmación de cancelación', () => {
  it('Sí, cancelar cancela el viaje y conserva driver_id', async () => {
    const event = makePollResultEvent(PHONE, POLL_MSG_ID, 'Sí, cancelar');
    const res = await POST(makePostRequest(event));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.cancelConfirmed).toBe(true);
    expect(body.tripId).toBe(TRIP_ID);

    const cancelUpdate = capturedTripUpdates.find((row) => row && row.status === 'cancelled');
    expect(cancelUpdate).toBeTruthy();
    expect(cancelUpdate.dispatch_status).toBe('cancelled');
    expect(cancelUpdate.cancel_reason).toBe(WHATSAPP_CANCEL_REASON);
    expect(cancelUpdate.wa_context).toBeNull();
    expect(cancelUpdate.driver_id).toBeUndefined();
  });

  it('No, mantener el viaje no cancela y limpia pending_cancel_confirm', async () => {
    const event = makePollResultEvent(PHONE, POLL_MSG_ID, 'No, mantener el viaje');
    const res = await POST(makePostRequest(event));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.cancelDenied).toBe(true);
    expect(capturedTripUpdates.some((row) => row && row.status === 'cancelled')).toBe(false);
    const denyUpdate = capturedTripUpdates.find((row) => row && Object.prototype.hasOwnProperty.call(row, 'wa_context'));
    expect(denyUpdate).toBeTruthy();
    expect(
      denyUpdate.wa_context == null || denyUpdate.wa_context.pending_cancel_confirm !== true
    ).toBe(true);
  });
});
