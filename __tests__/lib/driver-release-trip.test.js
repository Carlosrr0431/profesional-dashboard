const {
  buildPendingToQueuedUpdate,
  canDriverReleaseTripToQueue,
  canRecoverCancelledDriverReleaseToQueue,
  isAssignedDriverReleaseStatus,
  isDriverReleasedSearchReason,
  DRIVER_RELEASE_REASON,
} = require('../../src/lib/tripRequeue');
const {
  buildDriverReleaseQueuedExtras,
  isDriverReleaseAlreadyApplied,
} = require('../../src/lib/driverReleaseTrip');

describe('canDriverReleaseTripToQueue', () => {
  it('permite pending y assigned, no in_progress ni street hail asignado', () => {
    expect(canDriverReleaseTripToQueue({ status: 'pending' })).toBe(true);
    expect(canDriverReleaseTripToQueue({
      status: 'going_to_pickup',
      notes: '[PASSENGER_APP]',
      passenger_phone: '5493875551234',
    })).toBe(true);
    expect(canDriverReleaseTripToQueue({
      status: 'accepted',
      notes: '[APPROACH_ONLY]',
      passenger_phone: '5493875551234',
    })).toBe(true);
    expect(canDriverReleaseTripToQueue({ status: 'in_progress' })).toBe(false);
    expect(canDriverReleaseTripToQueue({
      status: 'going_to_pickup',
      notes: '[STREET_HAIL]\nViaje en calle',
      passenger_phone: null,
    })).toBe(false);
  });

  it('no suelta un viaje que el pasajero ya canceló', () => {
    expect(canDriverReleaseTripToQueue({
      status: 'going_to_pickup',
      cancel_reason: '[PASSENGER_APP] Cancelado por el pasajero',
    })).toBe(false);
  });

  it('recupera cancelled de pickup del pasajero, no calle ni viaje ya iniciado', () => {
    const passengerCancelled = {
      status: 'cancelled',
      driver_id: 'drv-1',
      started_at: null,
      cancel_reason: DRIVER_RELEASE_REASON,
      notes: '[PASSENGER_APP]',
      passenger_phone: '5493875551234',
    };
    expect(canRecoverCancelledDriverReleaseToQueue(passengerCancelled)).toBe(true);
    expect(canDriverReleaseTripToQueue(passengerCancelled)).toBe(true);
    expect(canRecoverCancelledDriverReleaseToQueue({
      ...passengerCancelled,
      started_at: '2026-09-14T22:50:00.000Z',
    })).toBe(false);
    expect(canRecoverCancelledDriverReleaseToQueue({
      ...passengerCancelled,
      notes: '[STREET_HAIL]\nViaje en calle',
      passenger_phone: null,
      wa_context: { source: 'street_hail' },
    })).toBe(false);
  });
});

describe('buildDriverReleaseQueuedExtras', () => {
  it('al soltar going_to_pickup limpia asignación y deja el mismo viaje en cola', () => {
    const trip = {
      status: 'going_to_pickup',
      notes: `[PASSENGER_APP]
[PICKUP_JSON:{"address":"Doctor Mariano Boedo 547, Salta","lat":-24.7952,"lng":-65.3953383}]`,
      origin_address: 'Doctor Mariano Boedo 547, Salta',
      origin_lat: -24.7952,
      origin_lng: -65.3953383,
      driver_id: 'drv-1',
      wa_context: {
        passenger_push_statuses: ['accepted', 'going_to_pickup'],
      },
    };

    const { extras, wasAssigned } = buildDriverReleaseQueuedExtras(trip, {
      driverId: 'drv-1',
      reason: DRIVER_RELEASE_REASON,
      now: new Date('2026-09-06T15:00:00.000Z'),
    });
    const update = buildPendingToQueuedUpdate(trip, extras);

    expect(wasAssigned).toBe(true);
    expect(isAssignedDriverReleaseStatus('going_to_pickup')).toBe(true);
    expect(update.status).toBe('queued');
    expect(update.driver_id).toBeNull();
    expect(update.started_at).toBeNull();
    expect(update.pickup_at).toBeNull();
    expect(update.wa_notified_at).toBeNull();
    expect(update.cancel_reason).toBe(DRIVER_RELEASE_REASON);
    expect(update.origin_address).toBe('Doctor Mariano Boedo 547, Salta');
    expect(extras.wa_context.dispatch_excluded_driver_ids).toContain('drv-1');
    expect(extras.wa_context.passenger_push_statuses).not.toContain('accepted');
    expect(extras.wa_context.passenger_push_statuses).not.toContain('going_to_pickup');
  });

  it('al recuperar cancelled de pickup limpia asignación y deja el mismo viaje en cola', () => {
    const trip = {
      status: 'cancelled',
      notes: `[PASSENGER_APP]
[PICKUP_JSON:{"address":"Juan Gálvez 218, Salta","lat":-24.7944183,"lng":-65.3769125}]
[FINAL_DEST_JSON:{"address":"Juan Gálvez 300, Salta","lat":-24.7918535,"lng":-65.3755106}]`,
      origin_address: 'Juan Gálvez 218, Salta',
      origin_lat: -24.7944183,
      origin_lng: -65.3769125,
      destination_address: 'Juan Gálvez 300, Salta',
      destination_lat: -24.7918535,
      destination_lng: -65.3755106,
      driver_id: 'drv-1',
      started_at: null,
      cancel_reason: DRIVER_RELEASE_REASON,
      wa_context: {
        passenger_push_statuses: ['pending', 'accepted', 'going_to_pickup', 'cancelled'],
      },
    };

    const { extras, wasAssigned } = buildDriverReleaseQueuedExtras(trip, {
      driverId: 'drv-1',
      reason: DRIVER_RELEASE_REASON,
      now: new Date('2026-09-14T22:48:31.000Z'),
    });
    const update = buildPendingToQueuedUpdate(trip, extras);

    expect(wasAssigned).toBe(true);
    expect(update.status).toBe('queued');
    expect(update.driver_id).toBeNull();
    expect(update.origin_address).toBe('Juan Gálvez 218, Salta');
    expect(update).not.toHaveProperty('destination_address');
    expect(update.wa_notified_at).toBeNull();
    expect(extras.wa_context.dispatch_excluded_driver_ids).toContain('drv-1');
  });

  it('pending no borra wa_notified_at ni started_at', () => {
    const { extras, wasAssigned } = buildDriverReleaseQueuedExtras({
      status: 'pending',
      wa_context: {},
    }, {
      driverId: 'drv-1',
      reason: 'Rechazado por chofer',
    });

    expect(wasAssigned).toBe(false);
    expect(extras.started_at).toBeUndefined();
    expect(extras.wa_notified_at).toBeUndefined();
    expect(extras.cancel_reason).toBe('Rechazado por chofer');
  });

  it('idempotencia: ya en queued con el chofer excluido', () => {
    expect(isDriverReleaseAlreadyApplied({
      status: 'queued',
      driver_id: null,
      wa_context: { dispatch_excluded_driver_ids: ['drv-1'] },
    }, 'drv-1')).toBe(true);
    expect(isDriverReleaseAlreadyApplied({
      status: 'going_to_pickup',
      driver_id: 'drv-1',
      wa_context: {},
    }, 'drv-1')).toBe(false);
  });

  it('detecta el motivo de búsqueda de otro chofer', () => {
    expect(isDriverReleasedSearchReason(DRIVER_RELEASE_REASON)).toBe(true);
    expect(isDriverReleasedSearchReason('Rechazado por chofer')).toBe(false);
  });
});
