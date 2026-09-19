/** @jest-environment node */

const mockGetSupabaseAdmin = jest.fn();
const mockRequireAdminUser = jest.fn();
const mockUpdateTripNotesAsOperator = jest.fn();

jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

jest.mock('../../src/lib/adminAuthServer', () => ({
  requireAdminUser: (...args) => mockRequireAdminUser(...args),
}));

jest.mock('../../src/lib/updateTripNotesAsOperator', () => ({
  updateTripNotesAsOperator: (...args) => mockUpdateTripNotesAsOperator(...args),
}));

describe('trips/notes API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseAdmin.mockReset();
    mockRequireAdminUser.mockReset();
    mockUpdateTripNotesAsOperator.mockReset();
    mockRequireAdminUser.mockResolvedValue({ user: { id: 'op-1' }, error: null, status: 200 });
    mockGetSupabaseAdmin.mockReturnValue({ from: jest.fn() });
  });

  it('PATCH rechaza si falta trip_id', async () => {
    const { PATCH } = await import('../../app/api/trips/notes/route.js');
    const response = await PATCH(new Request('http://test/api/trips/notes', {
      method: 'PATCH',
      body: JSON.stringify({ notes: 'Hola' }),
    }));
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
  });

  it('PATCH actualiza las notas', async () => {
    mockUpdateTripNotesAsOperator.mockResolvedValue({
      trip: { id: 'trip-1', notes: 'Esperar' },
      unchanged: false,
    });
    const { PATCH } = await import('../../app/api/trips/notes/route.js');
    const response = await PATCH(new Request('http://test/api/trips/notes', {
      method: 'PATCH',
      body: JSON.stringify({ trip_id: 'trip-1', notes: 'Esperar' }),
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockUpdateTripNotesAsOperator).toHaveBeenCalledWith(expect.anything(), 'trip-1', 'Esperar');
  });
});
