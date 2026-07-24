jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn(),
}));

const {
  normalizeWasenderStatus,
  isReconnectStatus,
  isConnectedStatus,
  handleWasenderSessionWebhook,
  WASENDER_SESSION_WEBHOOK_EVENTS,
} = require('../../src/lib/wasenderSession');

describe('wasenderSession helpers', () => {
  test('normaliza estados de Wasender', () => {
    expect(normalizeWasenderStatus('CONNECTED')).toBe('connected');
    expect(normalizeWasenderStatus('NEED_SCAN')).toBe('need_scan');
    expect(normalizeWasenderStatus('Logged Out')).toBe('logged_out');
    expect(normalizeWasenderStatus('needpasskey')).toBe('need_passkey');
  });

  test('detecta estados que requieren revinculación', () => {
    expect(isReconnectStatus('logged_out')).toBe(true);
    expect(isReconnectStatus('need_scan')).toBe(true);
    expect(isReconnectStatus('connected')).toBe(false);
    expect(isConnectedStatus('connected')).toBe(true);
  });

  test('lista eventos de webhook soportados', () => {
    expect(WASENDER_SESSION_WEBHOOK_EVENTS).toEqual(
      expect.arrayContaining(['session.status', 'qrcode.updated', 'passkey.updated'])
    );
  });
});

describe('handleWasenderSessionWebhook', () => {
  const upsertCalls = [];

  beforeEach(() => {
    upsertCalls.length = 0;
    const { getSupabaseAdmin } = require('../../src/lib/supabaseAdmin');
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        upsert: async (row) => {
          upsertCalls.push(row);
          return { error: null };
        },
        select: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      }),
    });
  });

  test('session.status logged_out limpia QR y passkey', async () => {
    const result = await handleWasenderSessionWebhook('session.status', { status: 'logged_out' });
    expect(result.handled).toBe(true);
    expect(result.status).toBe('logged_out');
    const keys = upsertCalls.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining([
      'wasender_session_status',
      'wasender_session_qr',
      'wasender_session_passkey',
      'wasender_session_updated_at',
    ]));
  });

  test('qrcode.updated guarda QR', async () => {
    const result = await handleWasenderSessionWebhook('qrcode.updated', { qr: '2@abc' });
    expect(result.handled).toBe(true);
    expect(result.status).toBe('need_scan');
    expect(upsertCalls.find((r) => r.key === 'wasender_session_qr')?.value).toBe('2@abc');
  });

  test('passkey.updated request guarda token', async () => {
    const result = await handleWasenderSessionWebhook('passkey.updated', {
      stage: 'request',
      token: 'temp-token',
      requestId: 'req-1',
      expiresAt: 123,
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe('need_passkey');
    const passkeyRow = upsertCalls.find((r) => r.key === 'wasender_session_passkey');
    expect(JSON.parse(passkeyRow.value).token).toBe('temp-token');
  });

  test('passkey.updated fallback_qr vuelve a need_scan', async () => {
    const result = await handleWasenderSessionWebhook('passkey.updated', {
      stage: 'fallback_qr',
      error: 'timeout',
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe('need_scan');
  });
});
