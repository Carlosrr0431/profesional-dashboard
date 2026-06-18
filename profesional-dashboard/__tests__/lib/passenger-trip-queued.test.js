const {
  buildFinalDestJsonTag,
  resolveFinalDestinationFromClient,
  buildPassengerQueuedTripPayload,
  fareFromClientPayload,
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

  it('resolveFinalDestinationFromClient usa coords del payload', () => {
    const resolved = resolveFinalDestinationFromClient({
      destinationAddress: finalDest.formattedAddress,
      destinationLat: finalDest.lat,
      destinationLng: finalDest.lng,
    });
    expect(resolved).toEqual(finalDest);
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
  });
});
