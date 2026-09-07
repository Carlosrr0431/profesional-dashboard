/** @jest-environment node */

import {
  digitsOnly,
  draftFromWindow,
  emptyWindowDraft,
  exampleTripBreakdown,
  formatWindowHours,
  formatWindowScheduleLabel,
  moneyAr,
  settingsMapFromTariffDefaults,
  timelinePercent,
  windowSegmentsForCalendarDay,
  windowTimelineSegments,
} from '../../src/lib/tariffUi';
import { artTimeContext, resolveChannelTariff } from '../../src/lib/resolveTariff';

describe('tariffUi', () => {
  it('formatea pesos y deja solo dígitos', () => {
    expect(moneyAr(5933)).toMatch(/^\$5[.,]933$/);
    expect(digitsOnly('$1.190')).toBe('1190');
  });

  it('formatea el horario de una franja', () => {
    expect(formatWindowHours({ start_minute: 22 * 60, end_minute: 6 * 60 })).toBe('22:00–06:00');
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
    expect(emptyWindowDraft(990, 983, 15).scheduleKind).toBe('always');
  });

  it('etiqueta franjas por día específico o días recurrentes', () => {
    expect(formatWindowScheduleLabel({
      schedule_kind: 'date',
      specific_date: '2026-12-25',
      label: 'Navidad',
    })).toBe('25 dic 2026 · Navidad');
    expect(formatWindowScheduleLabel({
      schedule_kind: 'weekdays',
      weekdays: [6, 7],
    })).toBe('Sáb · Dom');
    const draft = draftFromWindow({
      id: 'w1',
      start_minute: 22 * 60,
      end_minute: 6 * 60,
      per_km: 1190,
      base: 983,
      commission_percent: 15,
      schedule_kind: 'weekdays',
      weekdays: [6],
    });
    expect(draft.scheduleKind).toBe('weekdays');
    expect(draft.weekdays).toEqual([6]);
  });

  it('en el timeline, una nocturna del sábado solo pinta la madrugada el domingo', () => {
    const window = {
      start_minute: 22 * 60,
      end_minute: 6 * 60,
      schedule_kind: 'weekdays',
      weekdays: [6],
    };
    const saturday = artTimeContext(new Date('2026-09-05T23:00:00-03:00'));
    const sunday = artTimeContext(new Date('2026-09-06T02:00:00-03:00'));
    expect(windowSegmentsForCalendarDay(window, saturday)).toEqual([{ from: 22 * 60, to: 1440 }]);
    expect(windowSegmentsForCalendarDay(window, sunday)).toEqual([{ from: 0, to: 6 * 60 }]);
  });
});
