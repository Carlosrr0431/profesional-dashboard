/**
 * @jest-environment node
 */

describe('whatsappOutboundQueue helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('cola deshabilitada en test por defecto', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED;
    const { isWhatsappOutboundQueueEnabled } = require('../../src/lib/whatsappOutboundQueue');
    expect(isWhatsappOutboundQueueEnabled()).toBe(false);
  });

  test('cola habilitada con flag explícito', () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED = 'true';
    const { isWhatsappOutboundQueueEnabled } = require('../../src/lib/whatsappOutboundQueue');
    expect(isWhatsappOutboundQueueEnabled()).toBe(true);
  });

  test('intervalo default 15000ms', () => {
    delete process.env.WHATSAPP_OUTBOUND_INTERVAL_MS;
    jest.resetModules();
    const { WHATSAPP_OUTBOUND_INTERVAL_MS } = require('../../src/lib/whatsappOutboundQueue');
    expect(WHATSAPP_OUTBOUND_INTERVAL_MS).toBe(15_000);
  });

  test('prioridades OTP > poll > default', () => {
    const { OUTBOUND_PRIORITY } = require('../../src/lib/whatsappOutboundQueue');
    expect(OUTBOUND_PRIORITY.OTP).toBeGreaterThan(OUTBOUND_PRIORITY.POLL);
    expect(OUTBOUND_PRIORITY.POLL).toBeGreaterThan(OUTBOUND_PRIORITY.DEFAULT);
  });

  test('dedup_key distinto por línea/texto y estable para el mismo poll', () => {
    const { buildOutboundDedupKey } = require('../../src/lib/whatsappOutboundQueue');
    const a = buildOutboundDedupKey({
      kind: 'text',
      dest: '5493878630173',
      payload: { text: 'Hola' },
    });
    const b = buildOutboundDedupKey({
      kind: 'text',
      dest: '+54 9 3878 63-0173',
      payload: { text: 'Hola' },
    });
    const c = buildOutboundDedupKey({
      kind: 'text',
      dest: '5493878630173',
      payload: { text: 'Chau' },
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);

    const poll = {
      kind: 'poll',
      dest: '5493878630173',
      payload: { name: 'Elegí', options: ['Sí', 'No'] },
    };
    expect(buildOutboundDedupKey(poll)).toBe(buildOutboundDedupKey(poll));
  });
});

describe('sendWhatsmeowText con cola', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('con cola off usa envío directo HTTP', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED = 'false';

    global.fetch = jest.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/check-number')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            data: { jid: '5493878630173@s.whatsapp.net', registered: true },
          }),
          json: async () => ({
            success: true,
            data: { jid: '5493878630173@s.whatsapp.net', registered: true },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          success: true,
          data: { message_id: 'msg_direct_1' },
        }),
        json: async () => ({ success: true, data: { message_id: 'msg_direct_1' } }),
      };
    });

    const { sendWhatsmeowText } = require('../../src/lib/whatsmeowClient');
    const result = await sendWhatsmeowText('Agent', '3878630173', 'hola', { apiKey: 'k' });
    expect(result.success).toBe(true);
    expect(result.queued).toBeUndefined();
    expect(result.messageId).toBe('msg_direct_1');
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe('processOneWhatsappOutbound', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('marca sent cuando el envío directo ok', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

    const updateEq = jest.fn(async () => ({ error: null }));
    const update = jest.fn(() => ({ eq: updateEq }));
    const rpc = jest.fn(async (name) => {
      if (name === 'release_stale_whatsapp_outbound') return { data: 0, error: null };
      if (name === 'claim_whatsapp_outbound_message') {
        return {
          data: [{
            id: 'q1',
            agent_code: 'Agent',
            dest: '5493878630173',
            kind: 'text',
            payload: { text: 'hola' },
            attempts: 1,
            max_attempts: 5,
          }],
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    });

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({ rpc, from: () => ({ update }) }),
    }));

    jest.doMock('../../src/lib/whatsmeowClient', () => ({
      sendWhatsmeowTextDirect: jest.fn(async () => ({
        success: true,
        messageId: 'wa_1',
      })),
      sendWhatsmeowPollDirect: jest.fn(),
      getWhatsmeowApiKey: () => 'k',
    }));

    const { processOneWhatsappOutbound } = require('../../src/lib/whatsappOutboundQueue');
    const result = await processOneWhatsappOutbound({ claimer: 'test' });

    expect(result).toMatchObject({
      claimed: true,
      sent: true,
      queueId: 'q1',
      messageId: 'wa_1',
    });
    expect(update).toHaveBeenCalled();
    expect(updateEq).toHaveBeenCalledWith('id', 'q1');
  });

  test('sin filas / throttle → skipped', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        rpc: jest.fn(async () => ({ data: [], error: null })),
        from: () => ({ update: jest.fn() }),
      }),
    }));

    jest.doMock('../../src/lib/whatsmeowClient', () => ({
      sendWhatsmeowTextDirect: jest.fn(),
      sendWhatsmeowPollDirect: jest.fn(),
      getWhatsmeowApiKey: () => 'k',
    }));

    const { processOneWhatsappOutbound } = require('../../src/lib/whatsappOutboundQueue');
    const result = await processOneWhatsappOutbound({ claimer: 'test' });
    expect(result).toMatchObject({ claimed: false, skipped: 'empty_or_throttled' });
  });
});

describe('processWhatsappOutboundBatch por línea', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('envía dos líneas seguidas sin esperar el intervalo global', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

    const updateEq = jest.fn(async () => ({ error: null }));
    const update = jest.fn(() => ({ eq: updateEq }));
    let claimCount = 0;
    const rpc = jest.fn(async (name) => {
      if (name === 'release_stale_whatsapp_outbound') return { data: 0, error: null };
      if (name === 'claim_whatsapp_outbound_message') {
        claimCount += 1;
        if (claimCount === 1) {
          return {
            data: [{
              id: 'q-a',
              agent_code: 'Profesional_Pasajeros',
              dest: '549111',
              kind: 'text',
              payload: { text: 'otp' },
              attempts: 1,
              max_attempts: 5,
            }],
            error: null,
          };
        }
        if (claimCount === 2) {
          return {
            data: [{
              id: 'q-b',
              agent_code: 'Profesional_1',
              dest: '549222',
              kind: 'text',
              payload: { text: 'viaje' },
              attempts: 1,
              max_attempts: 5,
            }],
            error: null,
          };
        }
        return { data: [], error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    });

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({ rpc, from: () => ({ update }) }),
    }));

    jest.doMock('../../src/lib/whatsmeowClient', () => ({
      sendWhatsmeowTextDirect: jest.fn(async () => ({ success: true, messageId: 'wa' })),
      sendWhatsmeowPollDirect: jest.fn(),
      getWhatsmeowApiKey: () => 'k',
    }));

    const started = Date.now();
    const { processWhatsappOutboundBatch } = require('../../src/lib/whatsappOutboundQueue');
    const batch = await processWhatsappOutboundBatch({
      claimer: 'test',
      maxMessages: 8,
      deadlineMs: 5_000,
    });

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(batch.sent).toBe(2);
    expect(batch.results[0].agentCode).toBe('Profesional_Pasajeros');
    expect(batch.results[1].agentCode).toBe('Profesional_1');
  });
});

describe('processOneWhatsappOutbound circuit breaker', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('error de bloqueo pausa la línea y no reintenta el mensaje', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

    const updateEq = jest.fn(async () => ({ error: null }));
    const update = jest.fn(() => ({ eq: updateEq, gt: jest.fn(async () => ({ error: null })) }));
    const upsert = jest.fn(async () => ({ error: null }));
    const rpc = jest.fn(async (name) => {
      if (name === 'release_stale_whatsapp_outbound') return { data: 0, error: null };
      if (name === 'claim_whatsapp_outbound_message') {
        return {
          data: [{
            id: 'q-ban',
            agent_code: 'Agent',
            dest: '5493878630173',
            kind: 'text',
            payload: { text: 'hola' },
            attempts: 1,
            max_attempts: 5,
          }],
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    });

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({ rpc, from: () => ({ update, upsert }) }),
    }));

    jest.doMock('../../src/lib/whatsmeowClient', () => ({
      sendWhatsmeowTextDirect: jest.fn(async () => ({
        success: false,
        error: 'HTTP 403 Forbidden',
      })),
      sendWhatsmeowPollDirect: jest.fn(),
      getWhatsmeowApiKey: () => 'k',
    }));

    const { processOneWhatsappOutbound } = require('../../src/lib/whatsappOutboundQueue');
    const result = await processOneWhatsappOutbound({ claimer: 'test' });

    expect(result).toMatchObject({
      claimed: true,
      sent: false,
      permanentFailure: true,
      error: 'HTTP 403 Forbidden',
    });
    expect(upsert).toHaveBeenCalled();
  });
});
