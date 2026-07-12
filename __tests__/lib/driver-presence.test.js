const {
  resolveDriverIsOnline,
  isDriverPresenceFresh,
  hasValidDriverCoords,
} = require('../../src/lib/driverPresence');

describe('driverPresence', () => {
  const now = Date.parse('2026-07-12T23:00:00.000Z');

  it('requiere flag + coords + heartbeat fresco', () => {
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
      isAvailable: true,
      lat: -24.8,
      lng: -65.4,
      updatedAt: '2026-07-10T18:59:00.000Z',
    }, now)).toBe(false);

    expect(resolveDriverIsOnline({
      isAvailable: false,
      lat: -24.8,
      lng: -65.4,
      updatedAt: '2026-07-12T22:55:00.000Z',
    }, now)).toBe(false);
  });

  it('helpers de coords y frescura', () => {
    expect(hasValidDriverCoords(-24.8, -65.4)).toBe(true);
    expect(hasValidDriverCoords(0, 0)).toBe(false);
    expect(isDriverPresenceFresh('2026-07-12T22:50:00.000Z', now)).toBe(true);
    expect(isDriverPresenceFresh('2026-07-12T22:00:00.000Z', now)).toBe(false);
  });
});
