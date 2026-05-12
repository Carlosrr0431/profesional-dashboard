/**
 * location-direct-trip.test.js
 *
 * Regresion: si llega ubicación en tiempo real por WhatsApp,
 * debe crearse/derivarse el viaje directamente sin depender de
 * wa_context.awaiting_gps ni del historial de conversación.
 */

jest.mock('openai');
jest.mock('@supabase/supabase-js');

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai').default;

const { createOpenAIMock } = require('../helpers/openai-mock');
const { createQueryBuilder } = require('../helpers/supabase-mock');
const { makePostRequest, makeLocationEvent } = require('../helpers/request-factory');

const PHONE = '5493878630173';

let capturedTripInsert = null;
let conversationUpdates = [];

function buildSupabaseMock() {
  return {
    from: jest.fn((tableName) => {
      if (tableName === 'trips') {
        const builder = createQueryBuilder({ data: [], error: null });

        builder.maybeSingle.mockResolvedValue({ data: null, error: null });

        builder.insert.mockImplementation((payload) => {
          capturedTripInsert = payload;
          return builder;
        });

        builder.single.mockImplementation(async () => ({
          data: {
            id: 'trip-location-direct-1',
            ...(capturedTripInsert || {}),
          },
          error: null,
        }));

        return builder;
      }

      if (tableName === 'drivers') {
        return createQueryBuilder({ data: [], error: null });
      }

      if (tableName === 'service_zones') {
        return createQueryBuilder({ data: [], error: null });
      }

      if (tableName === 'whatsapp_conversations') {
        const builder = createQueryBuilder({
          data: {
            id: 'conv-location-1',
            phone: PHONE,
            context: JSON.stringify({ awaiting_gps: true, pickup_location: null }),
            updated_at: new Date().toISOString(),
          },
          error: null,
        });

        builder.update.mockImplementation((payload) => {
          conversationUpdates.push(payload);
          return builder;
        });

        return builder;
      }

      return createQueryBuilder({ data: [], error: null });
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
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
}

beforeEach(() => {
  capturedTripInsert = null;
  conversationUpdates = [];

  createClient.mockReturnValue(buildSupabaseMock());
  OpenAI.mockImplementation(() => createOpenAIMock());

  global.fetch = jest.fn().mockImplementation((url) => {
    const urlStr = String(url);

    if (urlStr.includes('wasenderapi.com') || urlStr.includes('test.wasenderapi.com')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { msgId: `msg-${Date.now()}` } }),
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });
    }

    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

const { POST } = require('../../app/api/Agente_IA/route');

describe('messages.upsert location -> viaje directo', () => {
  it('crea viaje con pickup GPS aun sin placeholder wa_context en trips', async () => {
    const event = makeLocationEvent(PHONE, {
      lat: -24.7945667,
      lng: -65.3766708,
      address: 'Cherin Pizzeria Artesanal',
    });

    const res = await POST(makePostRequest(event));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.gpsHandled).toBe(true);
    expect(body.tripId).toBe('trip-location-direct-1');

    expect(capturedTripInsert).toBeTruthy();
    expect(capturedTripInsert.status).toBe('queued');
    expect(capturedTripInsert.destination_address).toContain('Cherin');
    expect(capturedTripInsert.destination_lat).toBeCloseTo(-24.7945667);
    expect(capturedTripInsert.destination_lng).toBeCloseTo(-65.3766708);

    expect(
      conversationUpdates.some((update) => update && update.last_trip_id === 'trip-location-direct-1')
    ).toBe(true);
  });
});
