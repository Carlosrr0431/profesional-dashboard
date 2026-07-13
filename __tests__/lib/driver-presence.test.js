const {
  resolveDriverIsOnline,
  isDriverPresenceFresh,
  hasValidDriverCoords,
} = require('../../src/lib/driverPresence');

describe('driverPresence', () => {
  const now = Date.parse('2026-07-12T23:00:00.000Z');

  it('requiere flag + coords; simulación cuenta como online', () => {
    expect(resolveDriverIsOnline({
      isAvailable: true,
      lat: -24.8,
      lng: -65.4,
      updatedAt: '2026-07-12T22:55:00.000Z',
    }, now)).toBe(true);

    expect(resolveDriverIsOnline({
      isAvailable: true,
      lat: null,
      lng: null,
      updatedAt: '2026-07-12T22:55:00.000Z',
    }, now)).toBe(false);

    expect(resolveDriverIsOnline({
      isAvailable: false,
      lat: -24.8,
      lng: -65.4,
      updatedAt: '2026-07-12T22:55:00.000Z',
    }, now)).toBe(false);

    // Flag atascado sin coords (caso Marcelo) → offline
    expect(resolveDriverIsOnline({
      isAvailable: true,
      lat: 0,
      lng: 0,
      updatedAt: '2026-07-10T18:59:00.000Z',
    }, now)).toBe(false);

    // Simulación GPS activa con coords → online aunque el heartbeat sea viejo
    expect(resolveDriverIsOnline({
      isAvailable: true,
      lat: -24.79,
      lng: -65.37,
      updatedAt: '2026-07-10T18:59:00.000Z',
      gpsSimulationActive: true,
    }, now)).toBe(true);
  });

  it('helpers de coords y frescura', () => {
    expect(hasValidDriverCoords(-24.8, -65.4)).toBe(true);
    expect(hasValidDriverCoords(0, 0)).toBe(false);
    expect(isDriverPresenceFresh('2026-07-12T22:50:00.000Z', now)).toBe(true);
    expect(isDriverPresenceFresh('2026-07-12T20:00:00.000Z', now)).toBe(false);
  });
});
