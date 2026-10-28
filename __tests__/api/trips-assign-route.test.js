/** @jest-environment node */

const mockGetSupabaseAdmin = jest.fn();
const mockRequireAdminUser = jest.fn();
const mockResolveStreet = jest.fn();

jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

jest.mock('../../src/lib/adminAuthServer', () => ({
  requireAdminUser: (...args) => mockRequireAdminUser(...args),
}));

jest.mock('../../src/lib/resolveGpsStreetAddress', () => ({
  formatCoordAddress: (lat, lng) => `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`,
  resolveGpsStreetAddress: (...args) => mockResolveStreet(...args),
}));

function makeSupabase({ driverRow, loc }) {
  const inserted = [];
  const from = jest.fn((table) => {
    if (table === 'drivers') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: driverRow, error: null }) }) }) };
    }
    if (table === 'driver_locations') {
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: loc ? [loc] : [], error: null }) }) }) };
    }
    if (table === 'trips') {
      return {
        select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }),
        insert: (row) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: 'trip-1', ...row }, error: null }) }) };
        },
      };
    }
    throw new Error(`tabla inesperada: ${table}`);
  });
  return { client: { from }, inserted };
}

/** Pin del panel tomado al abrir el formulario (caso real zona sur). */
const STALE_PANEL_PIN = { lat: -24.80313, lng: -65.42996 };
const LIVE_GPS = { lat: -24.81291, lng: -65.42281 };

function assignRequest(extra = {}) {
  return new Request('http://test/api/trips/assign', {
    method: 'POST',
    body: JSON.stringify({
      driver_id: 'driver-5',
      destination_address: 'El Gran Tornado Mayorista, Avenida Paraguay',
      destination_lat: -24.8249716,
      destination_lng: -65.4272977,
      origin_lat: STALE_PANEL_PIN.lat,
      origin_lng: STALE_PANEL_PIN.lng,
      ...extra,
    }),
  });
}

describe('trips/assign API: punto de partida del chofer', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseAdmin.mockReset();
    mockRequireAdminUser.mockReset();
    mockResolveStreet.mockReset();
    mockRequireAdminUser.mockResolvedValue({ user: { id: 'op-1' }, error: null, status: 200 });
    mockResolveStreet.mockResolvedValue('Avenida Paraguay 2500, Salta');
  });

  it('usa el GPS vivo del chofer, no el pin viejo que mandó el panel', async () => {
    const now = Date.now();
    const { client, inserted } = makeSupabase({
      driverRow: {
        id: 'driver-5',
        billing_mode: 'weekly',
        current_lat: STALE_PANEL_PIN.lat,
        current_lng: STALE_PANEL_PIN.lng,
        updated_at: new Date(now - 90_000).toISOString(),
      },
      loc: { lat: LIVE_GPS.lat, lng: LIVE_GPS.lng, updated_at: new Date(now - 1_000).toISOString() },
    });
    mockGetSupabaseAdmin.mockReturnValue(client);

    const { POST } = await import('../../app/api/trips/assign/route.js');
    const response = await POST(assignRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(inserted[0].origin_lat).toBe(LIVE_GPS.lat);
    expect(inserted[0].origin_lng).toBe(LIVE_GPS.lng);
    expect(inserted[0].origin_address).toBe('Avenida Paraguay 2500, Salta');
    expect(mockResolveStreet).toHaveBeenCalledWith(LIVE_GPS.lat, LIVE_GPS.lng);
  });

  it('si el servidor no tiene GPS del chofer, usa el del panel', async () => {
    const { client, inserted } = makeSupabase({
      driverRow: { id: 'driver-5', billing_mode: 'weekly', current_lat: 0, current_lng: 0, updated_at: null },
      loc: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(client);

    const { POST } = await import('../../app/api/trips/assign/route.js');
    const response = await POST(assignRequest());

    expect(response.status).toBe(200);
    expect(inserted[0].origin_lat).toBe(STALE_PANEL_PIN.lat);
    expect(inserted[0].origin_lng).toBe(STALE_PANEL_PIN.lng);
    expect(mockResolveStreet).toHaveBeenCalledWith(STALE_PANEL_PIN.lat, STALE_PANEL_PIN.lng);
  });
});
