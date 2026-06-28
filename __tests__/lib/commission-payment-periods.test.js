import {
  getCommissionPeriodBounds,
  getWeekBoundsForAnchor,
  getMonthBoundsForAnchor,
  resolveCommissionPeriod,
  filterPaymentsByPeriod,
  filterPaymentsByRange,
  sumPaymentAmounts,
  groupPaymentsByDriver,
  paymentSourceLabel,
  toAnchorString,
  isDayInWeek,
} from '../../src/lib/commissionPaymentPeriods';

describe('commissionPaymentPeriods', () => {
  const reference = new Date('2026-06-28T15:00:00-03:00');

  test('getCommissionPeriodBounds month starts on first day Salta', () => {
    const { startIso, label } = getCommissionPeriodBounds('month', reference);
    expect(label).toBe('Este mes');
    expect(startIso).toBe('2026-06-01T03:00:00.000Z');
  });

  test('getCommissionPeriodBounds week starts on Monday', () => {
    const { startIso, label } = getCommissionPeriodBounds('week', reference);
    expect(label).toBe('Esta semana');
    expect(startIso).toBe('2026-06-22T03:00:00.000Z');
  });

  test('resolveCommissionPeriod with anchor for past month', () => {
    const { startIso, label } = resolveCommissionPeriod('month', '2026-05-15');
    expect(startIso).toBe('2026-05-01T03:00:00.000Z');
    expect(label).toMatch(/mayo/i);
  });

  test('getWeekBoundsForAnchor full week label', () => {
    const bounds = getWeekBoundsForAnchor(new Date('2026-06-15T12:00:00-03:00'), { capToNow: false });
    expect(bounds.startIso).toBe('2026-06-15T03:00:00.000Z');
    expect(bounds.label).toMatch(/Semana/);
  });

  test('filterPaymentsByPeriod and sumPaymentAmounts with anchor', () => {
    const payments = [
      { id: '1', amount: 100, created_at: '2026-06-27T12:00:00.000Z' },
      { id: '2', amount: 50, created_at: '2026-06-01T12:00:00.000Z' },
      { id: '3', amount: 25, created_at: '2025-12-01T12:00:00.000Z' },
    ];
    const week = filterPaymentsByPeriod(payments, 'week', reference, '2026-06-28');
    expect(week).toHaveLength(1);
    expect(sumPaymentAmounts(week)).toBe(100);

    const may = filterPaymentsByPeriod(payments, 'month', reference, '2026-06-01');
    expect(may).toHaveLength(2);
    expect(sumPaymentAmounts(may)).toBe(150);
  });

  test('filterPaymentsByRange respects end bound', () => {
    const payments = [
      { amount: 10, created_at: '2026-06-01T10:00:00.000Z' },
      { amount: 20, created_at: '2026-06-15T10:00:00.000Z' },
    ];
    const { startIso, endIso } = getMonthBoundsForAnchor(new Date('2026-06-01T12:00:00-03:00'), { capToNow: false });
    const filtered = filterPaymentsByRange(payments, startIso, endIso);
    expect(filtered).toHaveLength(2);
  });

  test('isDayInWeek highlights correct days', () => {
    expect(isDayInWeek(2026, 6, 28, '2026-06-28')).toBe(true);
    expect(isDayInWeek(2026, 6, 22, '2026-06-28')).toBe(true);
    expect(isDayInWeek(2026, 6, 21, '2026-06-28')).toBe(false);
  });

  test('groupPaymentsByDriver aggregates totals', () => {
    const payments = [
      { driver_id: 'a', amount: 100 },
      { driver_id: 'a', amount: 50 },
      { driver_id: 'b', amount: 30 },
    ];
    const grouped = groupPaymentsByDriver(payments, { a: 'Juan', b: 'Pedro' });
    expect(grouped).toHaveLength(2);
    expect(grouped[0].driver_name).toBe('Juan');
    expect(grouped[0].total).toBe(150);
    expect(grouped[0].count).toBe(2);
  });

  test('paymentSourceLabel', () => {
    expect(paymentSourceLabel('paypertic', null)).toBe('Paypertic (online)');
    expect(paymentSourceLabel('dashboard', 'Pago en efectivo')).toBe('Dashboard');
    expect(paymentSourceLabel(null, 'Pago online via Paypertic - ID: abc')).toBe('Paypertic (online)');
  });
});
