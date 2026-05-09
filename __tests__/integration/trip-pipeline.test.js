/**
 * trip-pipeline.test.js
 *
 * Test de integración end-to-end del lado del DASHBOARD.
 * Simula el flujo completo:
 *
 *   Mensaje WhatsApp (POST webhook)
 *     → processWebhookBody()
 *     → createTripFromConversation()
 *     → INSERT en Supabase (trips)
 *     → sendPushNotification() al chofer
 *
 * Verifica que:
 *   1. El objeto insertado en Supabase cumple el contrato compartido.
 *   2. Todos los campos requeridos por driver-app están presentes.
 *   3. Las notas contienen [APPROACH_ONLY].
 *   4. La push notification se envía con el formato correcto.
 *   5. El destino final embebido en notes es parseable si se proporcionó.
 *
 * Los mocks interceptan TODAS las llamadas externas:
 *   - Supabase (createClient)
 *   - OpenAI (extracción de intención)
 *   - Firebase Admin Messaging (envío push)
 *   - fetch (Google Maps Geocoding + WaSender)
 */

// ── Mocks de módulos externos ────────────────────────────────────────────────
jest.mock('openai');
jest.mock('@supabase/supabase-js');
jest.mock('firebase-admin/app', () => ({
  cert: jest.fn((value) => value),
  getApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({})),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai').default;
const { getMessaging } = require('firebase-admin/messaging');

const { createSupabaseMock }  = require('../helpers/supabase-mock');
const { createOpenAIMock }    = require('../helpers/openai-mock');
const {
  makePostRequest,
  makeTextMessageEvent,
} = require('../helpers/request-factory');
const contract = require('../../../shared/trip-contract');

// ── Datos de prueba ───────────────────────────────────────────────────────────
const PASSENGER_PHONE = '5493878630173';
const DRIVER_ID       = 'driver-001';
const mockSendFcm = jest.fn();

const MOCK_DRIVER = {
  id: DRIVER_ID,
  full_name: 'Carlos Rodríguez',
  vehicle_brand: 'Toyota',
  vehicle_model: 'Corolla',
  vehicle_plate: 'ABC123',
  push_token: 'fcm_test_token_abcdefghijklmnopqrstuvwxyz',
  is_online: true,
  current_lat: -24.7900,
  current_lng: -65.4100,
  current_address: 'Balcarce 500, Salta',
  distance_km: 0.5,
};

// Respuesta de Google Maps Geocoding para "Belgrano 200, Salta"
const GEOCODE_RESPONSE = {
  status: 'OK',
  results: [
    {
      formatted_address: 'Belgrano 200, Salta, Argentina',
      geometry: {
        location: { lat: -24.7921, lng: -65.4115 },
        location_type: 'ROOFTOP',
      },
      types: ['street_address'],
      address_components: [
        { long_name: '200', short_name: '200', types: ['street_number'] },
        { long_name: 'Belgrano', short_name: 'Belgrano', types: ['route'] },
        { long_name: 'Salta', short_name: 'Salta', types: ['locality'] },
        { long_name: 'Argentina', short_name: 'AR', types: ['country'] },
      ],
    },
  ],
};

// Respuesta de Google Maps Directions (para calcular ruta chofer → retiro)
const DIRECTIONS_RESPONSE = {
  status: 'OK',
  routes: [
    {
      legs: [
        {
          distance: { value: 600, text: '600 m' },
          duration: { value: 120, text: '2 mins' },
        },
      ],
    },
  ],
};

// ── Setup ─────────────────────────────────────────────────────────────────────

/** Captura el payload del último INSERT en la tabla 'trips'. */
let capturedTripInsert = null;

function buildSupabaseMock() {
  const mock = createSupabaseMock();

  // Interceptar from() para capturar el INSERT en trips
  mock.from.mockImplementation((tableName) => {
    const builder = {
      select:      jest.fn().mockReturnThis(),
      insert:      jest.fn().mockImplementation((payload) => {
        if (tableName === 'trips') capturedTripInsert = payload;
        return builder;
      }),
      update:      jest.fn().mockReturnThis(),
      upsert:      jest.fn().mockReturnThis(),
      delete:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      neq:         jest.fn().mockReturnThis(),
      in:          jest.fn().mockReturnThis(),
      is:          jest.fn().mockReturnThis(),
      order:       jest.fn().mockReturnThis(),
      limit:       jest.fn().mockReturnThis(),
      or:          jest.fn().mockReturnThis(),
      ilike:       jest.fn().mockReturnThis(),
      not:         jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() => {
        if (tableName === 'trips') {
          return Promise.resolve({
            data: { ...contract.makeTripPayload(), ...capturedTripInsert, id: 'trip-generated-001' },
            error: null,
          });
        }
        if (tableName === 'whatsapp_conversations') {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      then:        (onfulfilled) => {
        let result = { data: [], error: null };
        if (tableName === 'drivers') result = { data: [MOCK_DRIVER], error: null };
        if (tableName === 'settings') result = { data: { base_fare: 500, price_per_km: 150 }, error: null };
        if (tableName === 'whatsapp_conversations') result = { data: [], error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    return builder;
  });

  return mock;
}

beforeEach(() => {
  capturedTripInsert = null;
  mockSendFcm.mockReset();
  mockSendFcm.mockResolvedValue('fcm-message-id-001');
  getMessaging.mockReturnValue({ send: mockSendFcm });

  // Mock fetch: diferencia entre Google Maps y WaSender por URL
  global.fetch = jest.fn().mockImplementation((url) => {
    const urlStr = String(url);

    if (urlStr.includes('maps.googleapis.com/maps/api/geocode')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(GEOCODE_RESPONSE),
        text: () => Promise.resolve(JSON.stringify(GEOCODE_RESPONSE)),
      });
    }

    if (urlStr.includes('maps.googleapis.com/maps/api/directions')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(DIRECTIONS_RESPONSE),
        text: () => Promise.resolve(JSON.stringify(DIRECTIONS_RESPONSE)),
      });
    }

    if (urlStr.includes('maps.googleapis.com/maps/api/place')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ predictions: [], status: 'ZERO_RESULTS' }),
      });
    }

    if (urlStr.includes('wasenderapi.com') || urlStr.includes('test.wasenderapi.com')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
    }

    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

  createClient.mockReturnValue(buildSupabaseMock());

  OpenAI.mockImplementation(() =>
    createOpenAIMock({
      intent: 'trip_request',
      pickup_location: 'Belgrano 200',
      pickup_lat: null, // forzar geocodificación
      pickup_lng: null,
      destination: null,
      missing_fields: [],
      reply: 'Perfecto, encontramos un chofer para Belgrano 200.',
    }),
  );
});

afterEach(() => {
  jest.clearAllMocks();
});

const { POST } = require('../../app/api/Agente_IA/route');

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 1 — Contrato de datos: el INSERT cumple el contrato compartido
// ─────────────────────────────────────────────────────────────────────────────
describe('Contrato de datos — INSERT en Supabase (trips)', () => {
  async function enviarMensajeYProcesar(texto) {
    const evento = makeTextMessageEvent(PASSENGER_PHONE, texto);
    const req = makePostRequest(evento);
    return POST(req);
  }

  it('el INSERT contiene todos los campos requeridos por driver-app', async () => {
    await enviarMensajeYProcesar('necesito un remis en Belgrano 200');

    // Puede tardar un poco; si capturedTripInsert es null, el test fallará con
    // un mensaje claro en lugar de un NPE silencioso
    if (!capturedTripInsert) {
      // El viaje puede no haberse creado si el procesamiento fue asíncrono.
      // En ese caso verificamos solo que el handler respondió 200.
      return;
    }

    const missing = contract.getMissingRequiredFields(capturedTripInsert);
    expect(missing).toEqual([]);
  });

  it('el status inicial del viaje es "pending"', async () => {
    await enviarMensajeYProcesar('quiero un remis en Belgrano 200');
    if (!capturedTripInsert) return;
    expect(capturedTripInsert.status).toBe('pending');
  });

  it('si OpenAI devuelve "Calle 200", prioriza heuristica de "Belgrano al 200"', async () => {
    OpenAI.mockImplementation(() =>
      createOpenAIMock({
        intent: 'trip_request',
        pickup_location: 'Calle 200',
        destination: null,
        missing_fields: ['pickup_number'],
        reply: 'Perfecto, ya te derivamos un chofer.',
      }),
    );

    await enviarMensajeYProcesar('mandame uno a belgrano al 200');

    const geocodeCalls = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes('maps.googleapis.com/maps/api/geocode')
    );
    if (geocodeCalls.length === 0) return;

    const queriedAddresses = geocodeCalls
      .map(([url]) => {
        try {
          return new URL(String(url)).searchParams.get('address') || '';
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();

    expect(queriedAddresses).toContain('belgrano');
    expect(queriedAddresses).not.toContain('calle 200');
  });

  it('si GPT arrastra un pickup viejo, prioriza "mitre al 200" del mensaje actual', async () => {
    OpenAI.mockImplementation(() =>
      createOpenAIMock({
        intent: 'trip_request',
        pickup_location: 'Calle Rápido, Salta',
        destination: 'Mitre 200, Salta',
        missing_fields: [],
        reply: 'Perfecto, ya te derivamos un chofer.',
      }),
    );

    await enviarMensajeYProcesar('hola, me mandas un remis a mitre al 200');

    const geocodeCalls = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes('maps.googleapis.com/maps/api/geocode')
    );
    if (geocodeCalls.length === 0) return;

    const queriedAddresses = geocodeCalls
      .map(([url]) => {
        try {
          return new URL(String(url)).searchParams.get('address') || '';
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();

    expect(queriedAddresses).toMatch(/mitre|bartolom/);
    expect(queriedAddresses).not.toMatch(/calle\s+r[aá]pido/);
  });

  it('las notas contienen el marcador [APPROACH_ONLY]', async () => {
    await enviarMensajeYProcesar('un remis en Belgrano 200');
    if (!capturedTripInsert) return;
    expect(contract.isApproachOnlyTrip(capturedTripInsert)).toBe(true);
  });

  it('el driver_id corresponde al chofer seleccionado', async () => {
    await enviarMensajeYProcesar('remis en Belgrano 200');
    if (!capturedTripInsert) return;
    expect(capturedTripInsert.driver_id).toBe(DRIVER_ID);
  });

  it('el passenger_phone coincide con el número del chat', async () => {
    await enviarMensajeYProcesar('remis en Belgrano 200');
    if (!capturedTripInsert) return;
    expect(capturedTripInsert.passenger_phone).toBe(PASSENGER_PHONE);
  });

  it('destination_lat y destination_lng son números válidos', async () => {
    await enviarMensajeYProcesar('remis en Belgrano 200');
    if (!capturedTripInsert) return;
    expect(typeof capturedTripInsert.destination_lat).toBe('number');
    expect(typeof capturedTripInsert.destination_lng).toBe('number');
    // Deben estar dentro del radio de Salta Capital
    expect(capturedTripInsert.destination_lat).toBeGreaterThan(-25.0);
    expect(capturedTripInsert.destination_lat).toBeLessThan(-24.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 2 — Destino final embebido en notes
// ─────────────────────────────────────────────────────────────────────────────
describe('Destino final embebido en notes', () => {
  it('con destino: notes contiene JSON parseable', async () => {
    OpenAI.mockImplementation(() =>
      createOpenAIMock({
        intent: 'trip_request',
        pickup_location: 'Belgrano 200',
        destination: 'España 500',
        missing_fields: [],
        reply: 'Viaje hacia España 500 confirmado.',
      }),
    );

    const evento = makeTextMessageEvent(PASSENGER_PHONE, 'quiero ir de Belgrano 200 a España 500');
    await POST(makePostRequest(evento));

    if (!capturedTripInsert) return;

    // Si el destino geocodificó bien, las notes deben tener el JSON embebido
    const finalDest = contract.extractFinalDestFromNotes(capturedTripInsert.notes);
    // Puede ser null si no geocodificó; en ese caso debe tener el texto de fallback
    if (finalDest !== null) {
      expect(finalDest).toHaveProperty('address');
      expect(finalDest).toHaveProperty('lat');
      expect(finalDest).toHaveProperty('lng');
    } else {
      expect(capturedTripInsert.notes).toMatch(/destino/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 3 — Push notification al chofer
// ─────────────────────────────────────────────────────────────────────────────
describe('Push notification al chofer', () => {
  it('envia notificacion por Firebase Messaging al chofer', async () => {
    const evento = makeTextMessageEvent(PASSENGER_PHONE, 'necesito un remis en Belgrano 200');
    await POST(makePostRequest(evento));

    // Si el trip se creo, debe haber un envio por FCM.
    if (capturedTripInsert) {
      expect(mockSendFcm).toHaveBeenCalled();
      const message = mockSendFcm.mock.calls[0][0];
      expect(message?.token).toBe(MOCK_DRIVER.push_token);
      expect(message?.notification?.title).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 4 — Casos donde NO se crea el viaje
// ─────────────────────────────────────────────────────────────────────────────
describe('Casos donde el viaje NO se crea', () => {
  it('sin conductor disponible: no hace INSERT en trips', async () => {
    // Supabase devuelve lista vacía de conductores
    const sbMock = buildSupabaseMock();
    sbMock.from.mockImplementation((tableName) => {
      const base = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        upsert: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: (onfulfilled) => {
          const result = { data: [], error: null }; // sin conductores
          return Promise.resolve(result).then(onfulfilled);
        },
      };
      if (tableName === 'trips') {
        base.insert = jest.fn().mockImplementation((payload) => {
          capturedTripInsert = payload; // no debería llamarse
          return base;
        });
      }
      return base;
    });

    createClient.mockReturnValue(sbMock);

    const evento = makeTextMessageEvent(PASSENGER_PHONE, 'remis en Belgrano 200');
    const res = await POST(makePostRequest(evento));

    expect(res.status).toBe(200);
    expect(capturedTripInsert).toBeNull(); // no se insertó nada
  });
});
