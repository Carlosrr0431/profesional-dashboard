const {
  buildFinalDestJsonTag,
  resolveFinalDestinationFromClient,
  buildPassengerQueuedTripPayload,
  fareFromClientPayload,
  mergePassengerRouteFare,
  resolveQueuedTripSource,
  hasFiniteLatLng,
} = require('../../src/lib/passengerTripQueued');

describe('passengerTripQueued', () => {
  const pickup = {
    formattedAddress: 'Doctor Mariano Boedo 547, Salta',
    lat: -24.7952,
    lng: -65.3953,
  };

  const finalDest = {
    formattedAddress: 'Bartolomé Mitre 200-298, Salta, Argentina',
    lat: -24.791,
    lng: -65.375,
  };

  it('buildFinalDestJsonTag genera marcador parseable', () => {
    const tag = buildFinalDestJsonTag(finalDest);
    expect(tag).toMatch(/^\[FINAL_DEST_JSON:/);
    const json = JSON.parse(tag.slice('[FINAL_DEST_JSON:'.length, -1));
    expect(json.address).toContain('Mitre');
    expect(json.lat).toBe(-24.791);
    expect(json.lng).toBe(-65.375);
  });

  it('hasFiniteLatLng no trata null ni vacío como destino', () => {
    expect(hasFiniteLatLng(null, null)).toBe(false);
    expect(hasFiniteLatLng(undefined, undefined)).toBe(false);
    expect(hasFiniteLatLng('', '')).toBe(false);
    expect(hasFiniteLatLng(-24.78, -65.42)).toBe(true);
  });

  it('resolveFinalDestinationFromClient ignora destLat/destLng null', () => {
    expect(resolveFinalDestinationFromClient({
      destinationHint: null,
      destLat: null,
      destLng: null,
    })).toBeNull();
  });

  it('resolveFinalDestinationFromClient usa coords del payload', () => {
    const resolved = resolveFinalDestinationFromClient({
      destinationAddress: finalDest.formattedAddress,
      destinationLat: finalDest.lat,
      destinationLng: finalDest.lng,
    });
    expect(resolved).toEqual(finalDest);
  });

  it('resolveFinalDestinationFromClient acepta destLat/destLng del panel', () => {
    const resolved = resolveFinalDestinationFromClient({
      destinationHint: finalDest.formattedAddress,
      destLat: finalDest.lat,
      destLng: finalDest.lng,
    });
    expect(resolved).toEqual(finalDest);
  });

  it('resolveQueuedTripSource respeta canales y cae a dashboard', () => {
    expect(resolveQueuedTripSource('passenger_web')).toBe('passenger_web');
    expect(resolveQueuedTripSource('passenger_app')).toBe('passenger_app');
    expect(resolveQueuedTripSource('whatsapp')).toBe('whatsapp');
    expect(resolveQueuedTripSource('dashboard')).toBe('dashboard');
    expect(resolveQueuedTripSource(undefined)).toBe('dashboard');
    expect(resolveQueuedTripSource('otro')).toBe('dashboard');
  });

  it('dashboard solo origen: destination_* vacío y notes approach-only', () => {
    const payload = buildPassengerQueuedTripPayload({
      pickupLocation: pickup,
      finalDestinationLocation: null,
      passengerName: 'Operador',
      passengerPhone: null,
      source: 'dashboard',
      fare: null,
    });

    expect(payload.origin_address).toBe(pickup.formattedAddress);
    expect(payload.origin_lat).toBe(pickup.lat);
    expect(payload.destination_address).toBeNull();
    expect(payload.destination_lat).toBeNull();
    expect(payload.destination_lng).toBeNull();
    expect(payload.price).toBeNull();
    expect(payload.notes).toContain('[APPROACH_ONLY]');
    expect(payload.notes).toContain('[DASHBOARD]');
    expect(payload.notes).toContain('[PICKUP_JSON:');
    expect(payload.notes).not.toContain('[FINAL_DEST_JSON:');
    expect(payload.notes).not.toContain('[PASSENGER_APP]');
  });

  it('passenger_app sin destino lanza', () => {
    expect(() => buildPassengerQueuedTripPayload({
      pickupLocation: pickup,
      finalDestinationLocation: null,
      passengerName: 'Carlos',
      passengerPhone: '543878630173',
      source: 'passenger_app',
    })).toThrow('finalDestinationLocation requerida para passenger_app');
  });

  it('passenger_web sin destino lanza', () => {
    expect(() => buildPassengerQueuedTripPayload({
      pickupLocation: pickup,
      finalDestinationLocation: null,
      passengerName: 'Carlos',
      passengerPhone: '543878630173',
      source: 'passenger_web',
    })).toThrow('finalDestinationLocation requerida para passenger_app');
  });

  it('fareFromClientPayload aplica precio estimado de la app', () => {
    const fare = fareFromClientPayload({
      estimatedPrice: 4040,
      distanceKm: 2.4,
      durationMinutes: 9,
    });
    expect(fare).toEqual({
      price: 4040,
      commission_amount: null,
      distance_km: 2.4,
      duration_minutes: 9,
    });
  });

  it('buildPassengerQueuedTripPayload incluye FINAL_DEST_JSON y tarifa', () => {
    const fare = fareFromClientPayload({
      estimatedPrice: 4040,
      distanceKm: 2.4,
      durationMinutes: 9,
    });
    const payload = buildPassengerQueuedTripPayload({
      pickupLocation: pickup,
      finalDestinationLocation: finalDest,
      passengerName: 'Carlos',
      passengerPhone: '543878630173',
      source: 'passenger_app',
      fare,
    });

    expect(payload.origin_address).toBe(pickup.formattedAddress);
    expect(payload.destination_address).toBe(finalDest.formattedAddress);
    expect(payload.price).toBe(4040);
    expect(payload.distance_km).toBe(2.4);
    expect(payload.duration_minutes).toBe(9);
    expect(payload.notes).toContain('[APPROACH_ONLY]');
    expect(payload.notes).toContain('[PASSENGER_APP]');
    expect(payload.notes).toContain('[FINAL_DEST_JSON:');
    expect(payload.notes).not.toContain('Destino final sugerido:');
    expect(payload.notes).not.toContain('[PASSENGER_WEB]');
  });

  it('buildPassengerQueuedTripPayload marca passenger_web sin perder PASSENGER_APP', () => {
    const payload = buildPassengerQueuedTripPayload({
      pickupLocation: pickup,
      finalDestinationLocation: finalDest,
      passengerName: 'Carlos',
      passengerPhone: '543878630173',
      source: 'passenger_web',
      fare: fareFromClientPayload({
        estimatedPrice: 4040,
        distanceKm: 2.4,
        durationMinutes: 9,
      }),
    });

    expect(payload.notes).toContain('[PASSENGER_WEB]');
    expect(payload.notes).toContain('[PASSENGER_APP]');
    expect(payload.notes).toContain('Solicitado desde la web de pasajeros.');
  });

  it('mergePassengerRouteFare prioriza el precio del servidor', () => {
    const merged = mergePassengerRouteFare(
      { price: 3600, commission_amount: 1800, distance_km: 5, duration_minutes: 12 },
      { price: 3000, commission_amount: null, distance_km: 4.8, duration_minutes: 11 },
    );
    expect(merged.price).toBe(3600);
    expect(merged.commission_amount).toBe(1800);
    expect(merged.distance_km).toBe(5);
  });
});
