import {
  MAX_DRIVER_OFFER_ATTEMPTS,
  buildWaContextWithExcludedDriver,
  canResetTimeoutRoundExclusions,
  clearTimeoutRoundExclusions,
  getActiveDispatchExcludedDriverIds,
  getDispatchDriverOfferCounts,
  normalizeDispatchExclusionState,
} from '../src/lib/dispatchExclusions';

describe('dispatchExclusions', () => {
  it('excluye por timeout en la ronda actual y cuenta la primera oportunidad', () => {
    const updated = buildWaContextWithExcludedDriver({}, 'drv-a', 'pending_accept_timeout');

    expect(getActiveDispatchExcludedDriverIds(updated)).toEqual(['drv-a']);
    expect(getDispatchDriverOfferCounts(updated)).toEqual({ 'drv-a': 1 });
    expect(normalizeDispatchExclusionState(updated).roundExcluded).toEqual(['drv-a']);
    expect(normalizeDispatchExclusionState(updated).permanentExcluded).toEqual([]);
    expect(canResetTimeoutRoundExclusions(updated)).toBe(true);
  });

  it('mueve al chofer a exclusion permanente tras agotar 3 oportunidades por timeout', () => {
    let context = {};
    context = buildWaContextWithExcludedDriver(context, 'drv-a', 'pending_accept_timeout');
    context = buildWaContextWithExcludedDriver(context, 'drv-a', 'pending_accept_timeout');
    context = buildWaContextWithExcludedDriver(context, 'drv-a', 'pending_accept_timeout');

    expect(getDispatchDriverOfferCounts(context)).toEqual({ 'drv-a': MAX_DRIVER_OFFER_ATTEMPTS });
    expect(normalizeDispatchExclusionState(context).permanentExcluded).toEqual(['drv-a']);
    expect(normalizeDispatchExclusionState(context).roundExcluded).toEqual([]);
    expect(canResetTimeoutRoundExclusions(context)).toBe(false);
  });

  it('rechazo explicito queda excluido permanentemente', () => {
    const rejected = buildWaContextWithExcludedDriver({}, 'drv-b', 'driver_rejected');

    expect(normalizeDispatchExclusionState(rejected).permanentExcluded).toEqual(['drv-b']);
    expect(canResetTimeoutRoundExclusions(rejected)).toBe(false);
    expect(getDispatchDriverOfferCounts(rejected)).toEqual({});
  });

  it('notify_fail no excluye al chofer y solo registra metadata', () => {
    const context = { dispatch_excluded_driver_ids: ['drv-a'] };
    const notifyFailed = buildWaContextWithExcludedDriver(
      context,
      'drv-c',
      'notify_fail:whatsapp'
    );

    expect(getActiveDispatchExcludedDriverIds(notifyFailed)).toEqual(['drv-a']);
    expect(normalizeDispatchExclusionState(notifyFailed).permanentExcluded).toEqual(['drv-a']);
    expect(notifyFailed.dispatch_last_notify_fail_reason).toBe('whatsapp');
    expect(notifyFailed.dispatch_last_notify_fail_at).toBeTruthy();
  });

  it('limpia exclusiones de ronda y conserva las permanentes', () => {
    let context = buildWaContextWithExcludedDriver({}, 'drv-timeout', 'pending_accept_timeout');
    context = buildWaContextWithExcludedDriver(context, 'drv-reject', 'driver_rejected');

    const reset = clearTimeoutRoundExclusions(context);

    expect(getActiveDispatchExcludedDriverIds(reset)).toEqual(['drv-reject']);
    expect(canResetTimeoutRoundExclusions(reset)).toBe(false);
    expect(getDispatchDriverOfferCounts(reset)).toEqual({ 'drv-timeout': 1 });
  });

  it('formato legacy no permite reset de ronda', () => {
    const legacy = { dispatch_excluded_driver_ids: ['drv-legacy'] };

    expect(canResetTimeoutRoundExclusions(legacy)).toBe(false);
    expect(getActiveDispatchExcludedDriverIds(legacy)).toEqual(['drv-legacy']);
    expect(clearTimeoutRoundExclusions(legacy)).toEqual(legacy);
  });
});
