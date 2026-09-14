/** @jest-environment node */

import { createSupabaseMock } from '../helpers/supabase-mock';

const mockGetSupabaseAdmin = jest.fn();
const mockRequireAdminUser = jest.fn();

jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

jest.mock('../../src/lib/adminAuthServer', () => ({
  requireAdminUser: (...args) => mockRequireAdminUser(...args),
}));

const DRIVER_ID = 'drv-charly';
const MESSAGES = [
  {
    id: 'msg-base',
    driver_id: DRIVER_ID,
    sender_type: 'base',
    audio_url: 'https://cdn.example/base.wav',
    duration_seconds: 4,
    is_played: true,
    created_at: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 'msg-driver',
    driver_id: DRIVER_ID,
    sender_type: 'driver',
    audio_url: 'https://cdn.example/driver.m4a',
    duration_seconds: 7,
    is_played: false,
    created_at: '2026-01-01T10:01:00.000Z',
  },
];

describe('voice-messages API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseAdmin.mockReset();
    mockRequireAdminUser.mockReset();
    mockRequireAdminUser.mockResolvedValue({ user: { id: 'op-1' }, error: null, status: 200 });
  });

  it('GET rechaza si falta driver_id', async () => {
    const { GET } = await import('../../app/api/voice-messages/route.js');
    const response = await GET(new Request('http://test/api/voice-messages'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toMatch(/chofer/i);
  });

  it('GET lista los audios de un chofer, incluidos los del móvil', async () => {
    mockGetSupabaseAdmin.mockReturnValue(createSupabaseMock({
      voice_messages: { data: MESSAGES, error: null },
    }));

    const { GET } = await import('../../app/api/voice-messages/route.js');
    const response = await GET(
      new Request(`http://test/api/voice-messages?driver_id=${DRIVER_ID}`),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.messages).toEqual(MESSAGES);
  });

  it('GET inbox lista audios nuevos del chofer sin escuchar', async () => {
    mockGetSupabaseAdmin.mockReturnValue(createSupabaseMock({
      voice_messages: { data: [MESSAGES[1]], error: null },
    }));

    const { GET } = await import('../../app/api/voice-messages/route.js');
    const response = await GET(new Request('http://test/api/voice-messages?inbox=1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.messages).toEqual([MESSAGES[1]]);
  });

  it('PATCH marca audios como escuchados', async () => {
    mockGetSupabaseAdmin.mockReturnValue(createSupabaseMock({
      voice_messages: { data: null, error: null },
    }));

    const { PATCH } = await import('../../app/api/voice-messages/route.js');
    const response = await PATCH(new Request('http://test/api/voice-messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['msg-driver'], is_played: true }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.ids).toEqual(['msg-driver']);
  });
});
