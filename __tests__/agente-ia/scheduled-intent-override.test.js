/**
 * Regresión: mensaje con "mañana a las HH:MM" + remis no debe crear viaje inmediato (queued)
 * si la IA devuelve trip_request por error.
 */

jest.mock('openai');
jest.mock('@supabase/supabase-js');

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai').default;
const { createOpenAIMock } = require('../helpers/openai-mock');
const { createQueryBuilder } = require('../helpers/supabase-mock');
const { makePostRequest } = require('../helpers/request-factory');

const PHONE = '5493878630173';
const SCHEDULE_MSG = 'necesito un remis hoy a las 11:15 en Mitre 200';

let tripInsertPayload = null;

function buildSupabaseMock() {
  return {
    from: jest.fn((tableName) => {
      const builder = createQueryBuilder({ data: [], error: null });
      builder.maybeSingle.mockResolvedValue({ data: null, error: null });
      if (tableName === 'trips') {
        builder.insert.mockImplementation((payload) => {
          tripInsertPayload = payload;
          return builder;
        });
        builder.single.mockImplementation(async () => ({
          data: { id: 'trip-sched-override-1', ...(tripInsertPayload || {}) },
          error: null,
        }));
      }
      return builder;
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
          data: [{ inserted: true, conversation_id: 'conv-sched-override' }],
          error: null,
        });
      }
      if (fnName === 'claim_whatsapp_conversation_batch') {
        return Promise.resolve({
          data: [{
            id: 'conv-sched-override',
            status: 'collecting',
            phone: PHONE,
            push_name: 'Test',
            context: '{}',
            pending_messages: JSON.stringify([{ contenido: SCHEDULE_MSG }]),
            status: 'open',
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
}

let dateNowSpy = null;

beforeEach(() => {
  process.env.VERCEL = '1';
  tripInsertPayload = null;
  // 10:43 en Salta (UTC-3) → "hoy a las 10:50" debe ser reserva, no viaje inmediato
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 4, 25, 13, 43, 0));
  createClient.mockReturnValue(buildSupabaseMock());
  OpenAI.mockImplementation(() =>
    createOpenAIMock({
      intent: 'trip_request',
      confidence: 1,
      pickup_location: 'Güemes 200',
      missing_fields: [],
    })
  );
  const { installGeoFetchMock } = require('../helpers/geo-fetch-mock');
  installGeoFetchMock((url) => {
    const urlStr = String(url);
    if (urlStr.includes('wasenderapi.com') || urlStr.includes('test.wasenderapi.com')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { msgId: 'msg-1' } }),
        text: () => Promise.resolve('{}'),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
});

afterEach(() => {
  dateNowSpy?.mockRestore();
  jest.clearAllMocks();
});

const { POST } = require('../../app/api/Agente_IA/route');

describe('override trip_request → schedule_trip cuando hay fecha futura', () => {
  it('crea reserva con "hoy a las 11:15 en Mitre 200" aunque GPT confunda la calle', async () => {
    const res = await POST(
      makePostRequest({
        event: 'messages.upsert',
        data: {
          key: { id: 'msg-sched-1', remoteJid: `${PHONE}@s.whatsapp.net` },
          pushName: 'Test',
          message: { conversation: SCHEDULE_MSG },
        },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(tripInsertPayload).toBeTruthy();
    expect(tripInsertPayload.status).toBe('scheduled');
    expect(tripInsertPayload.scheduled_for).toBeTruthy();
    expect(String(tripInsertPayload.destination_address || '')).toMatch(/mitre/i);
    expect(tripInsertPayload.notes).toMatch(/\[SCHEDULED_FOR\]/);
  });
});
