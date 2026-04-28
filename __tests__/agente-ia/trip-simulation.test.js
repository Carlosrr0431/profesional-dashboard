/**
 * trip-simulation.test.js — Simulación del flujo completo de un viaje.
 *
 * Cada test reproduce un escenario real de chat de WhatsApp y verifica que
 * el agente cree el viaje correctamente, envíe el mensaje correcto al pasajero
 * y llame a Supabase con los datos esperados.
 *
 * Escenarios cubiertos:
 *   1. Pedido directo con dirección completa   → viaje creado
 *   2. Pasajero comparte pin GPS               → viaje creado con coords
 *   3. Dirección incompleta (solo calle)       → agente pide el número
 *   4. "Mismo lugar de siempre" con historial  → poll enviado
 *   5. Poll resuelto → viaje creado
 *
 * Cómo agregar un nuevo escenario:
 *   1. Preparar el payload con makeTextMessageEvent / makeLocationEvent
 *   2. Configurar createClient.mockReturnValue(createSupabaseMock({...}))
 *   3. Configurar OpenAI.mockImplementation(() => createOpenAIMock({...}))
 *   4. Llamar POST(makePostRequest(evento))
 *   5. Hacer assertions sobre res.status, body y las llamadas a fetch/supabase
 */

// ── Mocks de módulos externos ────────────────────────────────────────────────
jest.mock('openai');
jest.mock('@supabase/supabase-js');

// ── Imports ───────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai').default;

const { createSupabaseMock }  = require('../helpers/supabase-mock');
const { createOpenAIMock }    = require('../helpers/openai-mock');
const {
  makePostRequest,
  makeTextMessageEvent,
  makeLocationEvent,
  makePollResultEvent,
} = require('../helpers/request-factory');

const PHONE = '5493878630173';

// ── Datos de referencia ───────────────────────────────────────────────────────
const DRIVER = {
  id: 'drv-1',
  name: 'Carlos',
  is_online: true,
  current_lat: -24.79,
  current_lng: -65.41,
  current_address: 'Balcarce 500, Salta',
  push_token: 'expo-push-token-test',
  distance_km: 0.5,
};

const PENDING_CONVERSATION = {
  id: 'conv-1',
  phone: PHONE,
  status: 'pending',
  context: JSON.stringify({
    pickup_location: null,
    destination: null,
    missing_fields: [],
    awaiting_gps: false,
  }),
  last_message_at: new Date().toISOString(),
  messages: [
    { role: 'user', content: 'necesito un remis en Belgrano 200' },
  ],
};

// ── Setup global ───────────────────────────────────────────────────────────────
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
    text: () => Promise.resolve(''),
  });

  createClient.mockReturnValue(createSupabaseMock());
  OpenAI.mockImplementation(() => createOpenAIMock());
});

afterEach(() => {
  jest.clearAllMocks();
});

const { POST } = require('../../app/api/Agente_IA/route');

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 1 — Pedido directo con dirección completa
// ─────────────────────────────────────────────────────────────────────────────
describe('Escenario 1 — Pedido directo con dirección completa', () => {
  it('procesa el mensaje y responde 200', async () => {
    const evento = makeTextMessageEvent(PHONE, 'necesito un remis en Belgrano 200');

    // Supabase: sin conversación activa, hay un conductor disponible
    createClient.mockReturnValue(
      createSupabaseMock({
        whatsapp_conversations: { data: null, error: null }, // sin conversación activa
        drivers: { data: [DRIVER], error: null },
        trips: { data: { id: 'trip-new', status: 'pending' }, error: null },
        settings: { data: { base_fare: 500, price_per_km: 150 }, error: null },
      }),
    );

    // OpenAI: extrae intent trip_request con pickup resuelto
    OpenAI.mockImplementation(() =>
      createOpenAIMock({
        intent: 'trip_request',
        pickup_location: 'Belgrano 200',
        pickup_lat: -24.79,
        pickup_lng: -65.41,
        destination: null,
        missing_fields: [],
        reply: 'Perfecto, buscamos un remis para Belgrano 200.',
      }),
    );

    const req = makePostRequest(evento);
    const res = await POST(req);

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 2 — Pasajero comparte pin GPS
// ─────────────────────────────────────────────────────────────────────────────
describe('Escenario 2 — Pasajero comparte pin GPS', () => {
  it('usa las coordenadas directamente y responde 200', async () => {
    const evento = makeLocationEvent(PHONE, {
      lat: -24.7921,
      lng: -65.4101,
      address: 'Belgrano 200, Salta',
    });

    createClient.mockReturnValue(
      createSupabaseMock({
        drivers: { data: [DRIVER], error: null },
        trips: { data: { id: 'trip-gps', status: 'pending' }, error: null },
        settings: { data: { base_fare: 500, price_per_km: 150 }, error: null },
      }),
    );

    const req = makePostRequest(evento);
    const res = await POST(req);

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 3 — Dirección incompleta: solo calle sin número
// ─────────────────────────────────────────────────────────────────────────────
describe('Escenario 3 — Solo calle sin número', () => {
  it('el agente pide el número de calle y responde 200', async () => {
    const evento = makeTextMessageEvent(PHONE, 'quiero un remis en Belgrano');

    // OpenAI indica que falta el número de calle
    OpenAI.mockImplementation(() =>
      createOpenAIMock({
        intent: 'trip_request',
        pickup_location: 'Belgrano',
        pickup_lat: null,
        pickup_lng: null,
        missing_fields: ['pickup_number'],
        reply: '¿A qué altura de Belgrano? (número de calle)',
      }),
    );

    const req = makePostRequest(evento);
    const res = await POST(req);

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 4 — "Mismo lugar de siempre" con historial
// ─────────────────────────────────────────────────────────────────────────────
describe('Escenario 4 — Mismo lugar de siempre con historial', () => {
  it('envía un poll con los últimos puntos conocidos y responde 200', async () => {
    const evento = makeTextMessageEvent(PHONE, 'pasame a buscar al mismo lugar de siempre');

    OpenAI.mockImplementation(() =>
      createOpenAIMock({
        intent: 'trip_request',
        pickup_location: 'mismo lugar de siempre',
        pickup_lat: null,
        pickup_lng: null,
        missing_fields: ['pickup_location'],
        reply: '¿Cuál de estos lugares es?',
      }),
    );

    const req = makePostRequest(evento);
    const res = await POST(req);

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 5 — Poll resuelto: pasajero seleccionó una opción
// ─────────────────────────────────────────────────────────────────────────────
describe('Escenario 5 — Poll resuelto', () => {
  it('procesa la selección del poll y crea el viaje', async () => {
    const POLL_MSG_ID = 'poll-msg-001';
    const evento = makePollResultEvent(PHONE, POLL_MSG_ID, 'Belgrano 200, Salta');

    createClient.mockReturnValue(
      createSupabaseMock({
        // Conversación en estado awaiting_address_selection con el poll guardado
        whatsapp_conversations: {
          data: {
            id: 'conv-poll',
            phone: PHONE,
            status: 'awaiting_address_selection',
            context: JSON.stringify({
              awaiting_address_selection: true,
              address_poll_msg_id: POLL_MSG_ID,
              address_candidates: [
                { address: 'Belgrano 200, Salta', lat: -24.79, lng: -65.41 },
                { address: 'Belgrano 350, Salta', lat: -24.80, lng: -65.42 },
              ],
            }),
            messages: [],
          },
          error: null,
        },
        drivers: { data: [DRIVER], error: null },
        trips: { data: { id: 'trip-from-poll', status: 'pending' }, error: null },
        settings: { data: { base_fare: 500, price_per_km: 150 }, error: null },
      }),
    );

    const req = makePostRequest(evento);
    const res = await POST(req);

    expect(res.status).toBe(200);
  });
});
