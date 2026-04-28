/**
 * route.test.js — Tests del handler principal del Agente IA (POST + GET).
 *
 * Cada test mockea Supabase, OpenAI y fetch de forma independiente para
 * no contaminar otros tests. Los mocks se resetean automáticamente entre tests.
 *
 * Estructura:
 *   POST /api/Agente_IA
 *     ├── webhook.test → 200 ignored
 *     ├── messages.upsert sin config de servidor → 200 ignored
 *     ├── trip.transition sin autorización → 401
 *     └── trip.transition con autorización → 200
 *
 *   GET /api/Agente_IA
 *     ├── health check → 200 { status: 'ok' }
 *     └── cron sin autorización → 401
 */

// ── Mocks de módulos externos (deben declararse ANTES de cualquier import) ──
jest.mock('openai');
jest.mock('@supabase/supabase-js');

// ── Imports ──────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai').default;

const { createSupabaseMock }  = require('../helpers/supabase-mock');
const { createOpenAIMock }    = require('../helpers/openai-mock');
const {
  makePostRequest,
  makeGetRequest,
  makeTextMessageEvent,
  makeLocationEvent,
  makePollResultEvent,
  makeTripTransitionEvent,
} = require('../helpers/request-factory');

// ── Setup global de fetch ─────────────────────────────────────────────────────
beforeEach(() => {
  // Mock de fetch global (WaSender, Google Maps)
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
    text: () => Promise.resolve(''),
  });

  // Mock del cliente Supabase con datos básicos vacíos
  createClient.mockReturnValue(createSupabaseMock());

  // Mock del cliente OpenAI con intent trip_request por defecto
  OpenAI.mockImplementation(() => createOpenAIMock());
});

afterEach(() => {
  jest.clearAllMocks();
  // Resetear el singleton del módulo entre tests si es necesario
  // jest.resetModules();
});

// ── Importar los handlers DESPUÉS de configurar los mocks ────────────────────
// (next/jest con SWC transforma el ESM a CJS, por lo que require funciona)
const { POST, GET } = require('../../app/api/Agente_IA/route');

// ─────────────────────────────────────────────────────────────────────────────
// POST — Webhook WaSender
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/Agente_IA', () => {
  describe('webhook.test', () => {
    it('devuelve 200 con ignored=true', async () => {
      const req = makePostRequest({ event: 'webhook.test' });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.ignored).toBe(true);
    });
  });

  describe('trip.transition', () => {
    it('devuelve 401 sin header de autorización', async () => {
      const req = makePostRequest(makeTripTransitionEvent('trip-123'));
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
    });

    it('devuelve 400 cuando tripId está vacío', async () => {
      const req = makePostRequest(
        { event: 'trip.transition', tripId: '' },
        { 'x-trip-transition-secret': 'test-transition-secret' },
      );
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('devuelve 200 con tripId válido y autorización correcta', async () => {
      // Configurar Supabase para que retorne el viaje
      createClient.mockReturnValue(
        createSupabaseMock({
          trips: {
            data: [{ id: 'trip-123', status: 'pending', driver_id: 'drv-1' }],
            error: null,
          },
        }),
      );

      const req = makePostRequest(
        makeTripTransitionEvent('trip-123'),
        { 'x-trip-transition-secret': 'test-transition-secret' },
      );
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.tripId).toBe('trip-123');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET — Cron / Health check
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/Agente_IA', () => {
  it('health check devuelve 200', async () => {
    const req = makeGetRequest({ query: { health: '1' } });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    // El health payload tiene al menos un campo "status"
    expect(body).toHaveProperty('status');
  });

  it('cron sin Authorization devuelve 401', async () => {
    const req = makeGetRequest();
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('cron con Authorization Bearer correcto devuelve 200', async () => {
    // Sin conversaciones pendientes, el cron procesa 0 items
    createClient.mockReturnValue(
      createSupabaseMock({
        whatsapp_conversations: { data: [], error: null },
      }),
    );

    const req = makeGetRequest({
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
