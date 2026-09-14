/** @jest-environment node */

import { createSupabaseMock } from '../helpers/supabase-mock';

const mockGetSupabaseAdmin = jest.fn();

jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

describe('driver voice-messages API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseAdmin.mockReset();
  });

  it('POST guarda el audio del chofer con service role', async () => {
    const inserted = {
      id: 'msg-1',
      driver_id: 'drv-1',
      sender_type: 'driver',
      audio_url: 'https://cdn.example/driver.m4a',
      duration_seconds: 3,
      is_played: false,
      created_at: '2026-09-14T23:00:00.000Z',
    };
    const supabase = createSupabaseMock({
      drivers: { data: { id: 'drv-1' }, error: null },
      voice_messages: { data: inserted, error: null },
    });
    supabase.auth = {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    };
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    const { POST } = await import('../../app/api/driver/voice-messages/route.js');
    const response = await POST(new Request('http://test/api/driver/voice-messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-chofer',
      },
      body: JSON.stringify({
        audio_url: inserted.audio_url,
        duration_seconds: 3,
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.message.sender_type).toBe('driver');
    expect(payload.message.audio_url).toBe(inserted.audio_url);
  });
});
