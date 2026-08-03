/**
 * Tests: elegibilidad de dispatch según modo de cobro.
 */
const {
  BILLING_MODE_COMMISSION,
  BILLING_MODE_WEEKLY,
  normalizeBillingMode,
  resolveCommissionOverdue,
  isDriverEligibleForDispatch,
  resolveDispatchBlockReason,
} = require('../../shared/driver-billing');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe('driver-billing', () => {
  test('normalizeBillingMode defaults to commission_current', () => {
    expect(normalizeBillingMode(null)).toBe(BILLING_MODE_COMMISSION);
    expect(normalizeBillingMode(undefined)).toBe(BILLING_MODE_COMMISSION);
    expect(normalizeBillingMode('otro')).toBe(BILLING_MODE_COMMISSION);
    expect(normalizeBillingMode(BILLING_MODE_WEEKLY)).toBe(BILLING_MODE_WEEKLY);
  });

  test('resolveCommissionOverdue uses commission_debt_since_at + 3 days', () => {
    expect(resolveCommissionOverdue({ pending_commission: 100, commission_debt_since_at: null })).toBe(false);
    expect(resolveCommissionOverdue({ pending_commission: 0, commission_debt_since_at: daysAgo(10) })).toBe(false);
    expect(resolveCommissionOverdue({ pending_commission: 50, commission_debt_since_at: daysAgo(1) })).toBe(false);
    expect(resolveCommissionOverdue({ pending_commission: 50, commission_debt_since_at: daysAgo(4) })).toBe(true);
  });

  test('commission mode: overdue blocks dispatch', () => {
    const driver = {
      billing_mode: BILLING_MODE_COMMISSION,
      commission_blocked: false,
      pending_commission: 200,
      commission_debt_since_at: daysAgo(5),
    };
    expect(isDriverEligibleForDispatch(driver)).toBe(false);
    expect(resolveDispatchBlockReason(driver)).toBe('commission_overdue');
  });

  test('commission mode: within grace remains eligible', () => {
    const driver = {
      billing_mode: BILLING_MODE_COMMISSION,
      commission_blocked: false,
      pending_commission: 200,
      commission_debt_since_at: daysAgo(1),
    };
    expect(isDriverEligibleForDispatch(driver)).toBe(true);
    expect(resolveDispatchBlockReason(driver)).toBeNull();
  });

  test('weekly mode: always eligible even if overdue', () => {
    const driver = {
      billing_mode: BILLING_MODE_WEEKLY,
      commission_blocked: false,
      pending_commission: 500,
      commission_debt_since_at: daysAgo(30),
    };
    expect(resolveCommissionOverdue(driver)).toBe(true);
    expect(isDriverEligibleForDispatch(driver)).toBe(true);
    expect(resolveDispatchBlockReason(driver)).toBeNull();
  });

  test('weekly mode: manual commission_blocked excludes from dispatch', () => {
    const driver = {
      billing_mode: BILLING_MODE_WEEKLY,
      commission_blocked: true,
      pending_commission: 0,
      commission_debt_since_at: null,
    };
    expect(isDriverEligibleForDispatch(driver)).toBe(false);
    expect(resolveDispatchBlockReason(driver)).toBe('manual');
  });

  test('manual block wins over both modes', () => {
    const commission = {
      billing_mode: BILLING_MODE_COMMISSION,
      commission_blocked: true,
      pending_commission: 10,
      commission_debt_since_at: daysAgo(1),
    };
    expect(isDriverEligibleForDispatch(commission)).toBe(false);
    expect(resolveDispatchBlockReason(commission)).toBe('manual');
  });
});
