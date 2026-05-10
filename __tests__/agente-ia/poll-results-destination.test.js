/**
 * poll-results-destination.test.js
 *
 * Regresion: cuando se resuelve el pickup por encuesta (poll.results),
 * el destino final sugerido por el pasajero no debe perderse.
 * Debe persistirse en notes como [FINAL_DEST_JSON:...] cuando geocodifica.
 */

jest.mock('openai');
jest.mock('@supabase/supabase-js');

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai').default;

const { createOpenAIMock } = require('../helpers/openai-mock');
const { createQueryBuilder } = require('../helpers/supabase-mock');
const { makePostRequest, makePollResultEvent } = require('../helpers/request-factory');

const PHONE = '5493878630173';
const DRIVER_PHONE = '5493875550000';
const POLL_MSG_ID = 'poll-msg-destination-001';
const PICKUP_ADDRESS = 'Bartolome Mitre 200-298, A4400 Salta, Argentina';
const DESTINATION_HINT = 'Chacabuco 350, Salta';

let capturedTripInsert = null;
let conversationUpdates = [];

function buildSupabaseMock() {
  return {
    from: jest.fn((tableName) => {
      if (tableName === 'whatsapp_conversations') {
        const builder = createQueryBuilder({
          data: {
            id: 'conv-poll-1',
            phone: PHONE,
            push_name: 'Carlos Rodriguez R.',
            context: JSON.stringify({
              pending_poll: {
                msg_id: POLL_MSG_ID,
                phone: PHONE,
                candidates: [
                  {
                    label: PICKUP_ADDRESS,
                    formattedAddress: PICKUP_ADDRESS,
                    lat: -24.7874909,
                    lng: -65.4107292,
                  },
                  {
                    label: 'Ninguna de estas opciones',
                    formattedAddress: 'Ninguna de estas opciones',
                    lat: null,
                    lng: null,
                  },
                ],
                extracted: {
                  passenger_name: 'Carlos Rodriguez R.',
                  destination: DESTINATION_HINT,
                  notes: 'Creado desde seleccion de direccion en encuesta WhatsApp.',
                },
              },
            }),
            last_trip_id: null,
          },
          error: null,
        });

        builder.update.mockImplementation((payload) => {
          conversationUpdates.push(payload);
          return builder;
        });

        return builder;
      }

      if (tableName === 'drivers') {
        return createQueryBuilder({
          data: [
            {
              id: 'drv-poll-1',
              full_name: 'Chofer Test',
              phone: DRIVER_PHONE,
              push_token: null,
              current_lat: -24.79,
              current_lng: -65.41,
              is_available: true,
              vehicle_brand: 'Fiat',
              vehicle_model: 'Cronos',
              vehicle_plate: 'AA000AA',
            },
          ],
          error: null,
        });
      }

      if (tableName === 'trips') {
        const builder = createQueryBuilder({ data: [], error: null });

        builder.insert.mockImplementation((payload) => {
          capturedTripInsert = payload;
          return builder;
        });

        builder.single.mockImplementation(async () => ({
          data: {
            id: 'trip-poll-1',
            ...(capturedTripInsert || {}),
          },
          error: null,
        }));

        return builder;
      }

      if (tableName === 'service_zones') {
        return createQueryBuilder({ data: [], error: null });
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

    if (urlStr.includes('maps.googleapis.com/maps/api/geocode')) {
      const parsed = new URL(urlStr);
      const latlng = parsed.searchParams.get('latlng');

      if (latlng) {
        // reverse-geocode chofer origen
        const reversePayload = {
          status: 'OK',
          results: [
            {
              formatted_address: 'Balcarce 500, Salta, Argentina',
              geometry: { location_type: 'ROOFTOP' },
              types: ['street_address'],
              address_components: [
                { long_name: '500', types: ['street_number'] },
                { long_name: 'Balcarce', types: ['route'] },
              ],
            },
          ],
        };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(reversePayload),
          text: () => Promise.resolve(JSON.stringify(reversePayload)),
        });
      }

      // geocode del destino final sugerido
      const destinationPayload = {
        status: 'OK',
        results: [
          {
            formatted_address: 'Chacabuco 350, A4400 Salta, Argentina',
            geometry: {
              location: { lat: -24.7889, lng: -65.4042 },
              location_type: 'ROOFTOP',
            },
            types: ['street_address'],
            address_components: [
              { long_name: '350', types: ['street_number'] },
              { long_name: 'Chacabuco', types: ['route'] },
            ],
          },
        ],
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(destinationPayload),
        text: () => Promise.resolve(JSON.stringify(destinationPayload)),
      });
    }

    if (urlStr.includes('maps.googleapis.com/maps/api/directions')) {
      const directionsPayload = {
        status: 'OK',
        routes: [
          {
            legs: [
              {
                distance: { value: 900, text: '900 m' },
                duration: { value: 180, text: '3 mins' },
              },
            ],
          },
        ],
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(directionsPayload),
        text: () => Promise.resolve(JSON.stringify(directionsPayload)),
      });
    }

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

describe('poll.results -> destino final persistido', () => {
  it('crea viaje desde poll y guarda FINAL_DEST_JSON en notes', async () => {
    const event = makePollResultEvent(PHONE, POLL_MSG_ID, PICKUP_ADDRESS);
    const res = await POST(makePostRequest(event));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tripId).toBe('trip-poll-1');

    expect(capturedTripInsert).toBeTruthy();
    expect(capturedTripInsert.status).toBe('pending');
    expect(capturedTripInsert.destination_address).toBe(PICKUP_ADDRESS);
    expect(String(capturedTripInsert.notes || '')).toContain('[FINAL_DEST_JSON:');
    expect(String(capturedTripInsert.notes || '')).toContain('Chacabuco');

    expect(
      conversationUpdates.some((update) => update && update.last_trip_id === 'trip-poll-1')
    ).toBe(true);
  });
});
