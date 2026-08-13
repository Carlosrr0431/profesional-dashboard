const {
  isMissingDriverBillingColumnError,
  withoutOptionalDriverBillingColumns,
  selectDriversCompat,
} = require('../../src/lib/driversBillingSelect');

describe('driversBillingSelect', () => {
  it('detecta columna billing_mode inexistente', () => {
    expect(isMissingDriverBillingColumnError({
      message: 'column drivers.billing_mode does not exist',
    })).toBe(true);
  });

  it('detecta columna commission_blocked inexistente', () => {
    expect(isMissingDriverBillingColumnError({
      message: 'column drivers.commission_blocked does not exist',
    })).toBe(true);
  });

  it('no trata otros errores como columna de cobro faltante', () => {
    expect(isMissingDriverBillingColumnError({
      message: 'column drivers.full_name does not exist',
    })).toBe(false);
    expect(isMissingDriverBillingColumnError({ message: 'JWT expired' })).toBe(false);
  });

  it('saca billing_mode y commission_blocked del select', () => {
    expect(withoutOptionalDriverBillingColumns(
      'id, billing_mode, commission_blocked, pending_commission',
    )).toBe('id, pending_commission');
  });

  it('reintenta el select sin columnas de cobro si Postgres las rechaza', async () => {
    const calls = [];
    const supabase = {
      from: (table) => ({
        select: (select) => {
          calls.push({ table, select });
          if (select.includes('billing_mode')) {
            return Promise.resolve({
              data: null,
              error: { message: 'column drivers.billing_mode does not exist' },
            });
          }
          return Promise.resolve({ data: [{ id: 'd1' }], error: null });
        },
      }),
    };

    const result = await selectDriversCompat(
      supabase,
      'id, billing_mode, commission_blocked',
    );

    expect(calls).toHaveLength(2);
    expect(calls[1].select).toBe('id');
    expect(result.data).toEqual([{ id: 'd1' }]);
    expect(result.error).toBeNull();
  });
});
