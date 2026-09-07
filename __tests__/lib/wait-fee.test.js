const {
  billedWaitMinutes,
  waitFeeAmount,
  formatWaitClock,
  isWaitTimerActive,
  buildWaitFeeView,
} = require('../../src/spa/shared/waitFee');

describe('waitFee', () => {
  it('no cobra hasta el minuto completo', () => {
    expect(billedWaitMinutes(0)).toBe(0);
    expect(billedWaitMinutes(59_999)).toBe(0);
    expect(billedWaitMinutes(60_000)).toBe(1);
    expect(billedWaitMinutes(120_000)).toBe(2);
  });

  it('acumula el monto pactado por minuto', () => {
    expect(waitFeeAmount(2, 350)).toBe(700);
    expect(formatWaitClock(90_000)).toBe('01:30');
  });

  it('no inicia espera en street hail ni con pasajero a bordo', () => {
    expect(isWaitTimerActive({
      status: 'going_to_pickup',
      driver_arrived_at: '2026-09-06T12:00:00.000Z',
      notes: '[STREET_HAIL]',
    })).toBe(false);
    expect(isWaitTimerActive({
      status: 'in_progress',
      driver_arrived_at: '2026-09-06T12:00:00.000Z',
    })).toBe(false);
  });

  it('suma deuda previa al extra a pagar', () => {
    const view = buildWaitFeeView({
      status: 'going_to_pickup',
      driver_arrived_at: '2026-09-06T12:00:00.000Z',
      wait_fee_per_minute: 200,
      wait_prior_debt: 900,
    }, Date.parse('2026-09-06T12:01:00.000Z'));
    expect(view.fee).toBe(200);
    expect(view.extraDue).toBe(1100);
  });
});
