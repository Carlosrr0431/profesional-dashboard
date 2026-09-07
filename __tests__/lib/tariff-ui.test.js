/** @jest-environment node */

import {
  digitsOnly,
  emptyWindowDraft,
  exampleTripBreakdown,
  moneyAr,
  settingsMapFromTariffDefaults,
  timelinePercent,
  windowTimelineSegments,
} from '../../src/lib/tariffUi';
import { resolveChannelTariff } from '../../src/lib/resolveTariff';

describe('tariffUi', () => {
  it('formatea pesos y deja solo dígitos', () => {
    expect(moneyAr(5933)).toMatch(/^\$5[.,]933$/);
    expect(digitsOnly('$1.190')).toBe('1190');
  });

  it('parte una franja que cruza medianoche en dos segmentos', () => {
    expect(windowTimelineSegments({ start_minute: 22 * 60, end_minute: 6 * 60 })).toEqual([
      { from: 22 * 60, to: 1440 },
      { from: 0, to: 6 * 60 },
    ]);
    expect(windowTimelineSegments({ start_minute: 6 * 60, end_minute: 22 * 60 })).toEqual([
      { from: 6 * 60, to: 22 * 60 },
    ]);
  });

  it('ubica la hora actual en el timeline de 24 h', () => {
    expect(timelinePercent(0)).toBe(0);
    expect(timelinePercent(12 * 60)).toBe(50);
    expect(timelinePercent(1440)).toBe(0);
  });

  it('calcula el ejemplo de viaje con base, km y comisión', () => {
    const example = exampleTripBreakdown({ perKm: 990, base: 983, commissionPercent: 15 }, 5);
    expect(example.price).toBe(5933);
    expect(example.commission).toBe(890);
    expect(example.driverKeeps).toBe(5043);
  });

  it('arma el mapa de settings y resuelve la franja vigente', () => {
    const settingsMap = settingsMapFromTariffDefaults({
      platformDefaultPerKm: 990,
      platformDefaultBase: 983,
      platformDefaultCommission: 15,
      passengerAppTariffPerKm: 600,
      passengerAppTariffBase: 0,
      passengerAppCommissionPercent: 10,
      passengerWebTariffPerKm: 700,
      passengerWebTariffBase: 0,
      passengerWebCommissionPercent: 10,
    });
    const windows = [{
      channel: 'platform',
      start_minute: 22 * 60,
      end_minute: 6 * 60,
      per_km: 1190,
      base: 983,
      commission_percent: 15,
      enabled: true,
    }];
    const night = new Date('2026-09-07T02:00:00-03:00');
    const resolved = resolveChannelTariff({
      settingsMap,
      windows,
      channel: 'platform',
      at: night,
    });
    expect(resolved.source).toBe('window');
    expect(resolved.perKm).toBe(1190);
    expect(emptyWindowDraft(990, 983, 15).startTime).toBe('22:00');
  });
});
