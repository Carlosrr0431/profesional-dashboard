/** @jest-environment node */

const mockRequireAdminUser = jest.fn();
const mockGetSupabaseAdmin = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();
const mockPreview = jest.fn();
const mockProcess = jest.fn();
const mockProcessWa = jest.fn();
const mockIsConfigured = jest.fn();

jest.mock('../../src/lib/adminAuthServer', () => ({
  requireAdminUser: (...args) => mockRequireAdminUser(...args),
}));

jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

jest.mock('../../src/lib/bulkSmsQueue', () => ({
  createBulkSmsCampaign: (...args) => mockCreate(...args),
  listSmsCampaigns: (...args) => mockList(...args),
  previewBulkSmsCampaign: (...args) => mockPreview(...args),
  processSmsOutboundBatch: (...args) => mockProcess(...args),
  processWhatsappBulkBatch: (...args) => mockProcessWa(...args),
}));

jest.mock('../../src/lib/smsGateway', () => ({
  isSmsGatewayConfigured: (...args) => mockIsConfigured(...args),
}));

describe('sms-campaigns API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRequireAdminUser.mockReset();
    mockGetSupabaseAdmin.mockReset();
    mockCreate.mockReset();
    mockList.mockReset();
    mockPreview.mockReset();
    mockProcess.mockReset();
    mockProcessWa.mockReset();
    mockRequireAdminUser.mockResolvedValue({ user: { id: 'op-1', email: 'op@test.com' }, error: null, status: 200 });
    mockGetSupabaseAdmin.mockReturnValue({ mocked: true });
    mockIsConfigured.mockReturnValue(true);
  });

  test('GET exige operador', async () => {
    mockRequireAdminUser.mockResolvedValue({ user: null, error: 'No autorizado', status: 401 });
    const { GET } = await import('../../app/api/sms-campaigns/route.js');
    const response = await GET(new Request('http://test/api/sms-campaigns'));
    expect(response.status).toBe(401);
  });

  test('GET lista campañas', async () => {
    mockList.mockResolvedValue({ ok: true, campaigns: [{ id: 'camp-1' }], gatewayConfigured: true });
    const { GET } = await import('../../app/api/sms-campaigns/route.js');
    const response = await GET(new Request('http://test/api/sms-campaigns'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.campaigns).toHaveLength(1);
  });

  test('POST crea la campaña autenticada', async () => {
    mockCreate.mockResolvedValue({ ok: true, campaign: { id: 'camp-1' }, queuedCount: 2 });
    const { POST } = await import('../../app/api/sms-campaigns/route.js');
    const response = await POST(new Request('http://test/api/sms-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phones: '3878630173',
        body: 'Hola',
        link: 'https://www.profesionalviajes.com.ar',
      }),
    }));
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.queuedCount).toBe(2);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        phones: '3878630173',
        createdBy: 'op-1',
        respectQuietHours: true,
      }),
      expect.objectContaining({ supabase: { mocked: true } }),
    );
  });

  test('POST WhatsApp pasa canal e imagen', async () => {
    mockCreate.mockResolvedValue({ ok: true, campaign: { id: 'camp-wa' }, queuedCount: 1, channel: 'whatsapp' });
    const { POST } = await import('../../app/api/sms-campaigns/route.js');
    const response = await POST(new Request('http://test/api/sms-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phones: '3875550100',
        body: 'Promo',
        imageUrl: 'https://cdn.example/promo.jpg',
        channel: 'whatsapp',
      }),
    }));
    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        imageUrl: 'https://cdn.example/promo.jpg',
        body: 'Promo',
      }),
      expect.anything(),
    );
  });
});

describe('sms-queue-worker API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockProcess.mockReset();
    mockProcessWa.mockReset();
    mockIsConfigured.mockReset();
    mockIsConfigured.mockReturnValue(true);
    mockProcess.mockResolvedValue({ processed: 1, sent: 1, results: [{ sent: true }] });
    mockProcessWa.mockResolvedValue({ processed: 1, sent: 1, results: [{ sent: true }] });
  });

  test('rechaza sin cron secret', async () => {
    const { GET } = await import('../../app/api/sms-queue-worker/route.js');
    const response = await GET(new Request('http://test/api/sms-queue-worker'));
    expect(response.status).toBe(401);
  });

  test('procesa un lote autorizado', async () => {
    const { GET } = await import('../../app/api/sms-queue-worker/route.js');
    const response = await GET(new Request('http://test/api/sms-queue-worker', {
      headers: { Authorization: 'Bearer test-cron-secret' },
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.sent).toBe(2);
    expect(payload.whatsapp.sent).toBe(1);
  });

  test('sin SMSGate igual procesa WhatsApp y no responde 503', async () => {
    mockIsConfigured.mockReturnValue(false);
    mockProcessWa.mockResolvedValue({ processed: 1, sent: 1, results: [{ sent: true }] });
    const { GET } = await import('../../app/api/sms-queue-worker/route.js');
    const response = await GET(new Request('http://test/api/sms-queue-worker', {
      headers: { Authorization: 'Bearer test-cron-secret' },
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(mockProcess).not.toHaveBeenCalled();
    expect(payload.sms.skipped).toBe('no_gateway');
    expect(payload.whatsapp.sent).toBe(1);
    expect(payload.sent).toBe(1);
  });
});
