import {
  DRIVER_REJECT_COOLDOWN_MS,
  MAX_DRIVER_OFFER_ATTEMPTS,
  buildWaContextWithExcludedDriver,
  canResetTimeoutRoundExclusions,
  clearTimeoutRoundExclusions,
  driverIdsCoolingDownFromOffers,
  driverIdsWithPendingOffer,
  excludedDriverIdsForTrip,
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

  it('un rechazo con motivo deja al chofer fuera de ese viaje por 1 minuto', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    const rejected = buildWaContextWithExcludedDriver({}, 'drv-b', 'driver_rejected', now);

    expect(normalizeDispatchExclusionState(rejected).permanentExcluded).toEqual([]);
    expect(getActiveDispatchExcludedDriverIds(rejected, now.getTime())).toEqual(['drv-b']);
    expect(getActiveDispatchExcludedDriverIds(rejected, now.getTime() + DRIVER_REJECT_COOLDOWN_MS - 1)).toEqual(['drv-b']);
    expect(getActiveDispatchExcludedDriverIds(rejected, now.getTime() + DRIVER_REJECT_COOLDOWN_MS)).toEqual([]);
    expect(rejected.dispatch_driver_reject_cooldown_until['drv-b']).toBe('2026-10-31T12:01:00.000Z');
    expect(canResetTimeoutRoundExclusions(rejected)).toBe(false);
    expect(getDispatchDriverOfferCounts(rejected)).toEqual({});
  });

  it('una oferta rechazada hace menos de un minuto no se vuelve a abrir', () => {
    const now = Date.parse('2026-10-31T12:00:30.000Z');
    const offers = [
      { driver_id: 'drv-b', status: 'rejected', resolved_at: '2026-10-31T12:00:00.000Z' },
      { driver_id: 'drv-c', status: 'rejected', resolved_at: '2026-10-31T11:58:00.000Z' },
      { driver_id: 'drv-d', status: 'pending', resolved_at: null },
    ];

    expect(driverIdsCoolingDownFromOffers(offers, now)).toEqual(['drv-b']);
    expect(excludedDriverIdsForTrip({}, offers, now)).toEqual(['drv-b']);
  });

  it('un chofer con otra oferta abierta no recibe el resto de los viajes de la zona', () => {
    const offers = [
      { trip_id: 'viaje-a', driver_id: 'drv-1', status: 'pending' },
      { trip_id: 'viaje-b', driver_id: 'drv-2', status: 'pending' },
      { trip_id: 'viaje-a', driver_id: 'drv-3', status: 'rejected' },
    ];

    expect(driverIdsWithPendingOffer(offers)).toEqual(['drv-1', 'drv-2']);
    expect(driverIdsWithPendingOffer(offers, { ignoreTripId: 'viaje-a' })).toEqual(['drv-2']);
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

  it('un rechazo vía RPC no se pierde si el viaje ya tenía exclusiones de ronda', () => {
    const context = {
      dispatch_excluded_driver_ids: ['drv-rpc'],
      dispatch_permanent_excluded_driver_ids: [],
      dispatch_round_excluded_driver_ids: ['drv-timeout'],
    };

    expect(getActiveDispatchExcludedDriverIds(context)).toEqual(['drv-timeout', 'drv-rpc']);
  });
});
