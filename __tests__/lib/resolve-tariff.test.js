const {
  parseTimeToMinutes,
  minutesToTimeInput,
  windowContainsMinute,
  pickMatchingWindow,
  defaultsFromSettings,
  resolveChannelTariff,
  channelFromTripSource,
  overlayResolvedTariffSettings,
  priceFromTariff,
} = require('../../src/lib/resolveTariff');

describe('resolveTariff', () => {
  it('convierte HH:MM a minutos y de vuelta', () => {
    expect(parseTimeToMinutes('22:00')).toBe(22 * 60);
    expect(parseTimeToMinutes('06:30')).toBe(6 * 60 + 30);
    expect(minutesToTimeInput(22 * 60)).toBe('22:00');
    expect(parseTimeToMinutes('25:00')).toBeNull();
  });

  it('cubre franjas normales y que cruzan medianoche', () => {
    expect(windowContainsMinute({ start_minute: 8 * 60, end_minute: 18 * 60 }, 12 * 60)).toBe(true);
    expect(windowContainsMinute({ start_minute: 8 * 60, end_minute: 18 * 60 }, 20 * 60)).toBe(false);
    expect(windowContainsMinute({ start_minute: 22 * 60, end_minute: 6 * 60 }, 23 * 60)).toBe(true);
    expect(windowContainsMinute({ start_minute: 22 * 60, end_minute: 6 * 60 }, 2 * 60)).toBe(true);
    expect(windowContainsMinute({ start_minute: 22 * 60, end_minute: 6 * 60 }, 10 * 60)).toBe(false);
  });

  it('elige la franja más corta si se superponen', () => {
    const windows = [
      { channel: 'platform', start_minute: 0, end_minute: 1439, per_km: 1000, enabled: true },
      { channel: 'platform', start_minute: 22 * 60, end_minute: 6 * 60, per_km: 1800, enabled: true },
    ];
    const match = pickMatchingWindow(windows, 'platform', 23 * 60);
    expect(match.per_km).toBe(1800);
  });

  it('usa defaults si no hay franja y web hereda app si faltan keys', () => {
    const settingsMap = {
      passenger_app_tariff_per_km: '600',
      passenger_app_tariff_base: '0',
      passenger_app_commission_percent: '50',
    };
    expect(defaultsFromSettings(settingsMap, 'passenger_web')).toEqual({
      perKm: 600,
      base: 0,
      commissionPercent: 50,
    });
  });

  it('resuelve tarifa de franja sobre el default', () => {
    const settingsMap = {
      platform_tariff_per_km: '1500',
      platform_tariff_base: '500',
      platform_commission_percent: '50',
    };
    const windows = [{
      channel: 'platform',
      start_minute: 0,
      end_minute: 1439,
      per_km: 2000,
      base: 800,
      commission_percent: 40,
      enabled: true,
    }];
    const noon = new Date('2026-08-29T15:00:00-03:00');
    const resolved = resolveChannelTariff({ settingsMap, windows, channel: 'platform', at: noon });
    expect(resolved.source).toBe('window');
    expect(resolved.perKm).toBe(2000);
    expect(resolved.base).toBe(800);
    expect(priceFromTariff(resolved, 5)).toBe(10800);
  });

  it('mapea source de viaje a canal', () => {
    expect(channelFromTripSource('passenger_web')).toBe('passenger_web');
    expect(channelFromTripSource('passenger_app')).toBe('passenger_app');
    expect(channelFromTripSource('whatsapp')).toBe('platform');
  });

  it('overlay deja las keys de settings con el valor vigente', () => {
    const settingsMap = {
      passenger_app_tariff_per_km: '600',
      passenger_app_tariff_base: '0',
      passenger_app_commission_percent: '50',
    };
    const windows = [{
      channel: 'passenger_app',
      start_minute: 0,
      end_minute: 1439,
      per_km: 900,
      base: 100,
      commission_percent: 40,
      enabled: true,
    }];
    const overlay = overlayResolvedTariffSettings(settingsMap, windows, new Date('2026-08-29T15:00:00-03:00'));
    expect(overlay.passenger_app_tariff_per_km).toBe('900');
    expect(overlay.passenger_web_tariff_per_km).toBe('600');
  });
});
