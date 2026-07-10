/**
 * @jest-environment node
 */

jest.mock('@supabase/supabase-js', () => ({}));

describe('registerCommissionPayment idempotency', () => {
  function createMockSupabase({ existingPaypertic = null, pending = 356 } = {}) {
    const state = {
      payments: [],
      pending,
      updates: [],
    };

    const supabase = {
      from(table) {
        if (table === 'commission_payments') {
          return {
            select() {
              return {
                eq(column, value) {
                  return {
                    maybeSingle: async () => {
                      if (column === 'paypertic_id' && existingPaypertic && value === existingPaypertic) {
                        return { data: { id: 'pay-existing' }, error: null };
                      }
                      return { data: null, error: null };
                    },
                    eq() {
                      return {
                        maybeSingle: async () => ({ data: null, error: null }),
                      };
                    },
                  };
                },
              };
            },
            insert(row) {
              state.payments.push(row);
              return {
                select() {
                  return {
                    single: async () => ({ data: { id: `pay-${state.payments.length}` }, error: null }),
                  };
                },
              };
            },
          };
        }

        if (table === 'drivers') {
          return {
            select() {
              return {
                eq() {
                  return {
                    single: async () => ({
                      data: { pending_commission: state.pending },
                      error: null,
                    }),
                    maybeSingle: async () => ({
                      data: { pending_commission: state.pending },
                      error: null,
                    }),
                  };
                },
              };
            },
            update(payload) {
              state.updates.push(payload);
              state.pending = payload.pending_commission;
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === 'commission_accumulation_log') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        order: async () => ({ data: [], error: null }),
                      };
                    },
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    return { supabase, state };
  }

  test('permite dos pagos del dashboard con la misma note genérica', async () => {
    const { registerCommissionPayment } = require('../../src/lib/commissionPaymentRegister');
    const { supabase, state } = createMockSupabase({ pending: 356 });

    const first = await registerCommissionPayment(supabase, {
      driverId: 'driver-1',
      amount: 100,
      paymentSource: 'dashboard',
      notes: 'Pago desde panel del mapa',
    });
    expect(first.duplicated).toBe(false);
    expect(first.pending_commission).toBe(256);
    expect(state.payments).toHaveLength(1);

    const second = await registerCommissionPayment(supabase, {
      driverId: 'driver-1',
      amount: 256,
      paymentSource: 'dashboard',
      notes: 'Pago desde panel del mapa',
      resetPendingToZero: true,
    });
    expect(second.duplicated).toBe(false);
    expect(second.pending_commission).toBe(0);
    expect(state.payments).toHaveLength(2);
  });

  test('idempotencia solo por paypertic_id', async () => {
    const { registerCommissionPayment } = require('../../src/lib/commissionPaymentRegister');
    const { supabase, state } = createMockSupabase({
      existingPaypertic: 'ppt-1',
      pending: 356,
    });

    const result = await registerCommissionPayment(supabase, {
      driverId: 'driver-1',
      amount: 356,
      paymentSource: 'paypertic',
      payperticId: 'ppt-1',
    });

    expect(result.duplicated).toBe(true);
    expect(result.pending_commission).toBe(356);
    expect(state.payments).toHaveLength(0);
  });
});
