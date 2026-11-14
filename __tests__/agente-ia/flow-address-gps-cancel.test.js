/**
 * Simula un viaje real por calle y otro por GPS, y después los cancela.
 * Usa el webhook de Betto, la geocodificación de prueba y el mismo cierre
 * que deja el viaje en cancelled.
 */

jest.mock('openai');
jest.mock('@supabase/supabase-js');

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai').default;
const { createOpenAIMock } = require('../helpers/openai-mock');
const { installGeoFetchMock } = require('../helpers/geo-fetch-mock');
const { makePostRequest, makeTextMessageEvent, makeLocationEvent } = require('../helpers/request-factory');

const PHONE = '5493875550199';
const CONV_ID = 'conv-flow-1';

const state = {
  conv: null,
  trips: [],
  seq: 1,
};

function resetState() {
  state.trips = [];
  state.seq = 1;
  state.conv = {
    id: CONV_ID,
    phone: PHONE,
    push_name: 'Pasajero Test',
    status: 'open',
    context: {},
    pending_messages: [],
    is_collecting: false,
    accumulation_started_at: null,
    last_trip_id: null,
  };
}

function matches(row, filters, inFilters) {
  for (const [key, value] of filters) {
    if (row?.[key] !== value) return false;
  }
  for (const [key, values] of inFilters) {
    if (!values.includes(row?.[key])) return false;
  }
  return true;
}

function makeBuilder(table) {
  const filters = [];
  const inFilters = [];
  let op = 'select';
  let payload = null;

  const finish = (mode) => {
    if (table === 'trips') {
      if (op === 'insert') {
        const row = {
          id: `trip-flow-${state.seq}`,
          created_at: new Date().toISOString(),
          passenger_phone: PHONE,
          ...payload,
        };
        state.seq += 1;
        state.trips.push(row);
        return { data: mode === 'one' ? row : [row], error: null };
      }
      if (op === 'update') {
        const hits = state.trips.filter((trip) => matches(trip, filters, inFilters));
        hits.forEach((trip) => Object.assign(trip, payload));
        const row = hits[0] ? { ...hits[0] } : null;
        return { data: mode === 'one' ? row : hits, error: null };
      }
      const hits = state.trips.filter((trip) => matches(trip, filters, inFilters));
      return { data: mode === 'one' ? (hits[0] || null) : hits, error: null };
    }

    if (table === 'whatsapp_conversations') {
      if (op === 'update') {
        Object.assign(state.conv, payload);
        return { data: mode === 'one' ? state.conv : [state.conv], error: null };
      }
      const ok = matches(state.conv, filters, inFilters);
      return { data: mode === 'one' ? (ok ? state.conv : null) : (ok ? [state.conv] : []), error: null };
    }

    if (table === 'settings') {
      const rows = [
        { key: 'whatsapp_agent_enabled', value: 'true' },
        { key: 'passenger_app_tariff_base', value: '0' },
        { key: 'passenger_app_tariff_per_km', value: '0' },
        { key: 'passenger_app_commission_percent', value: '0' },
      ];
      const hit = rows.find((row) => filters.every(([key, value]) => row[key] === value));
      return { data: mode === 'one' ? (hit || rows[0]) : rows, error: null };
    }

    return { data: mode === 'one' ? null : [], error: null };
  };

  const builder = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (ok, fail) => Promise.resolve(finish('many')).then(ok, fail);
      }
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => Promise.resolve(finish('one'));
      }
      if (prop === 'insert' || prop === 'update' || prop === 'upsert') {
        return (next) => {
          op = prop === 'upsert' ? 'insert' : prop;
          payload = next;
          return builder;
        };
      }
      if (prop === 'eq' || prop === 'neq') {
        return (key, value) => {
          if (prop === 'eq') filters.push([key, value]);
          return builder;
        };
      }
      if (prop === 'in') {
        return (key, values) => {
          inFilters.push([key, values]);
          return builder;
        };
      }
      return () => builder;
    },
  });
  return builder;
}

const client = {
  from: (table) => makeBuilder(table),
  rpc: (name, args) => {
    if (name === 'append_whatsapp_message') {
      state.conv.pending_messages = [
        ...(state.conv.pending_messages || []),
        {
          tipo: args.p_message_type || 'text',
          contenido: args.p_content,
          timestamp: new Date().toISOString(),
        },
      ];
      state.conv.is_collecting = true;
      state.conv.accumulation_started_at = new Date(Date.now() - 5000).toISOString();
      return Promise.resolve({
        data: [{ conversation_id: CONV_ID, inserted: true }],
        error: null,
      });
    }
    if (name === 'claim_whatsapp_conversation_batch') {
      if (!state.conv.is_collecting) return Promise.resolve({ data: [], error: null });
      const pending = state.conv.pending_messages;
      state.conv.is_collecting = false;
      state.conv.pending_messages = [];
      return Promise.resolve({
        data: [{
          id: state.conv.id,
          phone: state.conv.phone,
          push_name: state.conv.push_name,
          context: state.conv.context || {},
          pending_messages: pending,
          status: state.conv.status || 'open',
          last_trip_id: state.conv.last_trip_id || null,
        }],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  },
  channel: () => ({
    on: () => client.channel(),
    subscribe: () => client.channel(),
    unsubscribe: () => {},
  }),
  removeChannel: () => {},
  auth: { getUser: async () => ({ data: { user: null }, error: null }) },
};

createClient.mockReturnValue(client);
OpenAI.mockImplementation(() => createOpenAIMock());

const { POST } = require('../../app/api/Agente_IA/route');

async function post(event) {
  const res = await POST(makePostRequest(event));
  const body = await res.json();
  return { status: res.status, body };
}

beforeEach(() => {
  resetState();
  installGeoFetchMock((url) => {
    const urlStr = String(url);
    if (urlStr.includes('deepseek') || urlStr.includes('openai')) {
      return Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'test' } }),
        text: async () => 'test',
      });
    }
    if (urlStr.includes('whatsmeow') || urlStr.includes('wasender')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { message_id: 'out-1', msgId: 'out-1' } }),
        text: async () => '{"success":true}',
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
  });
});

async function cancelOpenTrip() {
  const ask = await post(makeTextMessageEvent(PHONE, 'cancelar', 'msg-cancelar'));
  expect(ask.status).toBe(200);
  const open = state.trips.find((trip) => trip.status !== 'cancelled');
  expect(open).toBeTruthy();
  expect(open.wa_context?.pending_cancel_confirm).toBe(true);
  expect(open.status).not.toBe('cancelled');

  const yes = await post(makeTextMessageEvent(PHONE, 'sí', 'msg-si'));
  expect(yes.status).toBe(200);
  expect(open.status).toBe('cancelled');
  expect(open.dispatch_status).toBe('cancelled');
  expect(String(open.cancel_reason || '')).toMatch(/whatsapp/i);
}

describe('flujo real: dirección, GPS y cancelación', () => {
  it('deriva Mitre 200 y después lo cancela', async () => {
    const created = await post(makeTextMessageEvent(PHONE, 'mandame un movil a Mitre 200', 'msg-mitre'));
    expect(created.status).toBe(200);
    expect(created.body.success).toBe(true);

    const trip = state.trips.find((row) => row.status === 'queued' || row.status === 'pending');
    expect(trip).toBeTruthy();
    const label = `${trip.origin_address || ''} ${trip.notes || ''}`;
    expect(label).toMatch(/mitre/i);
    expect(label).not.toMatch(/belgrano/i);
    expect(['queued', 'pending']).toContain(trip.status);

    await cancelOpenTrip();
    expect(state.trips.filter((row) => row.status !== 'cancelled')).toHaveLength(0);
  }, 20000);

  it('deriva un pin GPS y después lo cancela', async () => {
    const created = await post(makeLocationEvent(PHONE, {
      lat: -24.7851,
      lng: -65.4102,
      address: 'España 111, Salta',
    }));
    expect(created.status).toBe(200);
    expect(created.body.gpsHandled).toBe(true);
    expect(created.body.ok).toBe(true);

    const trip = state.trips[0];
    expect(trip.status).toBe('queued');
    expect(trip.origin_lat).toBeCloseTo(-24.7851, 4);
    expect(trip.origin_lng).toBeCloseTo(-65.4102, 4);
    expect(trip.wa_context?.gps_pin).toBe(true);

    const second = await post(makeTextMessageEvent(PHONE, 'mandame un movil a Mitre 200', 'msg-otro'));
    expect(second.status).toBe(200);
    expect(state.trips.filter((row) => row.status !== 'cancelled')).toHaveLength(1);

    await cancelOpenTrip();
  }, 20000);
});
