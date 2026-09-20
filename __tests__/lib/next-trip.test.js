const {
  shouldFallbackToBusyDrivers,
  canOfferNextTripToBusyDriver,
  pickBusyNextTripCandidate,
  pickIdleThenBusyByRadius,
  shouldAcceptAsNextTrip,
  isNextTripOffer,
  isReservedNextTrip,
  shouldTreatAsLiveDriverTrip,
  buildNextTripOfferAssignUpdate,
  buildAcceptAsNextTripUpdate,
  buildActivateNextTripUpdate,
  partitionDriverBusyTrips,
  isNextTripUniqueViolation,
  mergeDriversById,
} = require('../../shared/next-trip');

const PICKUP = { lat: -24.78, lng: -65.42 };

function makeBusyDriver(id, coords = PICKUP) {
  return {
    id,
    current_lat: coords.lat,
    current_lng: coords.lng,
  };
}

function makeLiveTrip(id, driverId, dest = PICKUP) {
  return {
    id,
    driver_id: driverId,
    status: 'in_progress',
    destination_lat: dest.lat,
    destination_lng: dest.lng,
  };
}

describe('next-trip dispatch', () => {
  it('solo busca ocupados cuando no hay libres en el radio', () => {
    expect(shouldFallbackToBusyDrivers({ idleInRadiusCount: 2 })).toBe(false);
    expect(shouldFallbackToBusyDrivers({ idleInRadiusCount: 0 })).toBe(true);
  });

  it('busca ocupados si ya hubo ofertas sin aceptar, aunque haya libres', () => {
    expect(shouldFallbackToBusyDrivers({ idleInRadiusCount: 2, unacceptedOffers: 1 })).toBe(true);
  });

  it('en el mismo anillo pasa a ocupados si el viaje no se aceptó', () => {
    const idle = [{ driver: { id: 'far-idle' }, distanceKm: 5 }];
    const selected = pickIdleThenBusyByRadius({
      idleCandidates: idle,
      allowedRadiiKm: [1, 6],
      unacceptedOffers: 1,
      pickBusyAtRadii: (radii) => (radii.includes(1)
        ? { driver: { id: 'near-busy' }, nextTrip: true, radiusKm: 1 }
        : null),
    });
    expect(selected.driver.id).toBe('near-busy');
    expect(selected.nextTrip).toBe(true);
  });

  it('en el primer intento sigue eligiendo al libre aunque haya ocupados cerca', () => {
    const selected = pickIdleThenBusyByRadius({
      idleCandidates: [{ driver: { id: 'far-idle' }, distanceKm: 5 }],
      allowedRadiiKm: [1, 6],
      unacceptedOffers: 0,
      pickBusyAtRadii: () => ({ driver: { id: 'near-busy' }, nextTrip: true }),
    });
    expect(selected.driver.id).toBe('far-idle');
  });

  it('no ofrece siguiente a quien ya rechazó este viaje', () => {
    expect(canOfferNextTripToBusyDriver({
      driverId: 'd1',
      currentTrip: makeLiveTrip('t1', 'd1'),
      excludedDriverIds: ['d1'],
    })).toBe(false);
  });

  it('elige al ocupado cuyo destino queda más cerca del nuevo retiro', () => {
    const nearDropoff = { lat: -24.79, lng: -65.41 };
    const farDropoff = { lat: -24.90, lng: -65.55 };
    const selected = pickBusyNextTripCandidate({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      allowedRadiiKm: [1, 2, 3, 6],
      busyDrivers: [makeBusyDriver('far'), makeBusyDriver('near')],
      currentTripByDriverId: {
        far: makeLiveTrip('live-far', 'far', farDropoff),
        near: makeLiveTrip('live-near', 'near', nearDropoff),
      },
    });
    expect(selected.driver.id).toBe('near');
    expect(selected.nextTrip).toBe(true);
    expect(selected.currentTripId).toBe('live-near');
    expect(selected.anchorSource).toBe('dropoff');
  });

  it('con asignación manual solo ofrece al chofer preferido ocupado', () => {
    const selected = pickBusyNextTripCandidate({
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      allowedRadiiKm: [8],
      busyDrivers: [makeBusyDriver('other'), makeBusyDriver('pref')],
      currentTripByDriverId: {
        other: makeLiveTrip('live-other', 'other'),
        pref: makeLiveTrip('live-pref', 'pref'),
      },
      preferredDriverId: 'pref',
      preferredOnly: true,
    });
    expect(selected.driver.id).toBe('pref');
  });
});

describe('next-trip lifecycle', () => {
  it('detecta oferta y reserva sin tratarlas como viaje activo', () => {
    const offer = { id: 'n1', status: 'pending', next_after_trip_id: 'live-1' };
    const reserved = { id: 'n1', status: 'accepted', next_after_trip_id: 'live-1' };
    const live = { id: 'live-1', status: 'in_progress' };
    expect(isNextTripOffer(offer)).toBe(true);
    expect(isReservedNextTrip(reserved)).toBe(true);
    expect(shouldTreatAsLiveDriverTrip(reserved)).toBe(false);
    expect(shouldTreatAsLiveDriverTrip(live)).toBe(true);
  });

  it('acepta en paralelo solo si ya hay un viaje vivo distinto', () => {
    expect(shouldAcceptAsNextTrip({
      liveTrip: { id: 'live-1', status: 'going_to_pickup' },
      offerTripId: 'n1',
    })).toBe(true);
    expect(shouldAcceptAsNextTrip({
      liveTrip: { id: 'n1', status: 'going_to_pickup' },
      offerTripId: 'n1',
    })).toBe(false);
    expect(shouldAcceptAsNextTrip({ liveTrip: null, offerTripId: 'n1' })).toBe(false);
  });

  it('arma updates de oferta, aceptación y activación', () => {
    const offer = buildNextTripOfferAssignUpdate({
      driverId: 'd1',
      currentTripId: 'live-1',
      assignedAt: '2026-09-20T12:00:00.000Z',
    });
    expect(offer).toMatchObject({
      driver_id: 'd1',
      status: 'pending',
      next_after_trip_id: 'live-1',
    });
    expect(buildAcceptAsNextTripUpdate({ acceptedAt: '2026-09-20T12:00:01.000Z' })).toMatchObject({
      status: 'accepted',
      dispatch_status: 'accepted',
    });
    expect(buildActivateNextTripUpdate({ acceptedAt: '2026-09-20T12:10:00.000Z' })).toMatchObject({
      status: 'going_to_pickup',
      next_after_trip_id: null,
    });
  });
});

describe('next-trip occupancy helpers', () => {
  it('separa viaje vivo, siguiente reservado y oferta pending', () => {
    const partitioned = partitionDriverBusyTrips([
      { id: 'live-1', driver_id: 'd1', status: 'in_progress' },
      { id: 'n1', driver_id: 'd1', status: 'pending', next_after_trip_id: 'live-1' },
      { id: 'p2', driver_id: 'd2', status: 'pending' },
      { id: 'ignore', driver_id: 'd3', status: 'in_progress' },
    ], { ignoreTripId: 'ignore' });
    expect(partitioned.liveBusyTrips.map((t) => t.id)).toEqual(['live-1']);
    expect([...partitioned.reservedNextDriverIds]).toEqual(['d1']);
    expect([...partitioned.pendingOfferDriverIds]).toEqual(['d2']);
  });

  it('detecta unique violation de siguiente viaje', () => {
    expect(isNextTripUniqueViolation({
      code: '23505',
      message: 'duplicate key value violates unique constraint "trips_one_reserved_next_per_driver"',
    })).toBe(true);
    expect(isNextTripUniqueViolation({ code: '23505', message: 'other_unique' })).toBe(false);
    expect(isNextTripUniqueViolation({ code: '42501' })).toBe(false);
  });

  it('mergea choferes ocupados faltantes sin duplicar', () => {
    const merged = mergeDriversById(
      [{ id: 'idle', name: 'Libre' }],
      [{ id: 'busy', name: 'Ocupado' }, { id: 'idle', name: 'Dup' }],
    );
    expect(merged.map((d) => d.id)).toEqual(['idle', 'busy']);
    expect(merged[0].name).toBe('Libre');
  });
});
