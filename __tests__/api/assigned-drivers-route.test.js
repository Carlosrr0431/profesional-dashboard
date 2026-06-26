/** @jest-environment node */

import { createSupabaseMock } from '../helpers/supabase-mock';

const mockGetSupabaseAdmin = jest.fn();

jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

describe('assigned drivers API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseAdmin.mockReset();
  });

  it('POST rechaza teléfono inválido', async () => {
    mockGetSupabaseAdmin.mockReturnValue(createSupabaseMock());

    const { POST } = await import('../../app/api/driver-management/drivers/[driverId]/assigned/route.js');
    const response = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ fullName: 'Pedro', phone: '12' }),
      }),
      { params: Promise.resolve({ driverId: 'owner-1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toMatch(/teléfono/i);
  });
});
