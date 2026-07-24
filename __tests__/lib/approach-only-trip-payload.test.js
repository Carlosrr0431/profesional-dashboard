const {
  buildApproachOnlyTripInsertPayload,
  buildApproachOnlyTripNotes,
} = require('../../src/lib/approachOnlyTripPayload');
const { buildPassengerQueuedTripPayload } = require('../../src/lib/passengerTripQueued');
const {
  buildFinalDestJsonMarker,
  buildPickupJsonMarker,
} = require('../../shared/trip-contract');

describe('approachOnlyTripPayload', () => {
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

  it('payload WhatsApp con destino: origin_* = recogida, destination_* = destino final', () => {
    const payload = buildApproachOnlyTripInsertPayload({
      pickupLocation: pickup,
      finalDestinationLocation: finalDest,
      passengerName: 'Juan',
      passengerPhone: '543878630173',
      fare: {
        price: 4040,
        commission_amount: 808,
        distance_km: 2.4,
        duration_minutes: 9,
      },
      source: 'whatsapp',
    });

    expect(payload.origin_address).toBe(pickup.formattedAddress);
    expect(payload.origin_lat).toBe(pickup.lat);
    expect(payload.destination_address).toBe(finalDest.formattedAddress);
    expect(payload.destination_lat).toBe(finalDest.lat);
    expect(payload.status).toBe('queued');
    expect(payload.dispatch_status).toBe('queued');
    expect(payload.price).toBe(4040);
    expect(payload.commission_amount).toBe(808);
    expect(payload.notes).toContain('[APPROACH_ONLY]');
    expect(payload.notes).toContain('[FINAL_DEST_JSON:');
    expect(payload.notes).toContain('[PICKUP_JSON:');
    expect(payload.notes).not.toContain('[DASHBOARD]');
    expect(payload.notes).not.toContain('Destino final sugerido:');
  });

  it('payload passenger_app: origin_* = recogida, destination_* = destino final', () => {
    const payload = buildPassengerQueuedTripPayload({
      pickupLocation: pickup,
      finalDestinationLocation: finalDest,
      passengerName: 'Carlos',
      passengerPhone: '543878630173',
      fare: { price: 5000, commission_amount: 1000, distance_km: 3, duration_minutes: 10 },
      source: 'passenger_app',
    });

    expect(payload.origin_address).toBe(pickup.formattedAddress);
    expect(payload.origin_lat).toBe(pickup.lat);
    expect(payload.destination_address).toBe(finalDest.formattedAddress);
    expect(payload.destination_lat).toBe(finalDest.lat);
    expect(payload.notes).toContain('[APPROACH_ONLY]');
    expect(payload.notes).toContain('[PASSENGER_APP]');
    expect(payload.notes).toContain('Solicitado desde la app de pasajeros.');
    expect(payload.notes).toContain('[FINAL_DEST_JSON:');
    expect(payload.notes).toContain('[PICKUP_JSON:');
    expect(payload.notes).not.toContain('[DASHBOARD]');
    expect((payload.notes.match(/\[PASSENGER_APP\]/g) || []).length).toBe(1);
    expect(payload.notes).not.toContain('Destino final sugerido:');
  });

  it('payload WhatsApp solo retiro: origin_* = recogida, destination_* vacío', () => {
    const payload = buildApproachOnlyTripInsertPayload({
      pickupLocation: pickup,
      finalDestinationLocation: null,
      passengerName: 'Ana',
      passengerPhone: '543878630173',
      source: 'whatsapp',
    });

    expect(payload.origin_address).toBe(pickup.formattedAddress);
    expect(payload.origin_lat).toBe(pickup.lat);
    expect(payload.destination_address).toBeNull();
    expect(payload.destination_lat).toBeNull();
    expect(payload.notes).toContain('[APPROACH_ONLY]');
    expect(payload.notes).toContain('[PICKUP_JSON:');
    expect(payload.notes).not.toContain('[FINAL_DEST_JSON:');
  });

  it('trip-contract: buildFinalDestJsonMarker(null) no lanza', () => {
    expect(buildFinalDestJsonMarker(null)).toBeNull();
    expect(buildFinalDestJsonMarker(undefined)).toBeNull();
  });

  it('trip-contract: buildPickupJsonMarker(null) no lanza', () => {
    expect(buildPickupJsonMarker(null)).toBeNull();
  });

  it('notes WhatsApp sin destino: patrón legacy buildFinalDestJsonMarker(null) seguro', () => {
    const notes = buildApproachOnlyTripNotes({
      source: 'whatsapp',
      pickupLocation: pickup,
      finalDestinationLocation: null,
    });
    expect(notes).toContain('[APPROACH_ONLY]');
    expect(notes).not.toContain('[FINAL_DEST_JSON:');
  });

  it('payload passenger_app programado: status scheduled + markers de fuente', () => {
    const scheduledFor = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const payload = buildApproachOnlyTripInsertPayload({
      pickupLocation: pickup,
      finalDestinationLocation: finalDest,
      passengerName: 'Carlos',
      passengerPhone: '543878630173',
      fare: { price: 5000, commission_amount: 1000, distance_km: 3, duration_minutes: 10 },
      source: 'passenger_app',
      scheduledFor,
      scheduledDisplay: 'lunes 20/07 a las 15:30',
    });

    expect(payload.status).toBe('scheduled');
    expect(payload.dispatch_status).toBe('idle');
    expect(payload.scheduled_for).toBe(scheduledFor.toISOString());
    expect(payload.notes).toContain('[PASSENGER_APP]');
    expect(payload.notes).toContain('[SCHEDULED_FOR]');
    expect(payload.notes).toContain('[SCHEDULED_DISPLAY] lunes 20/07 a las 15:30');
    expect(payload.notes).toContain('[SCHEDULED_SOURCE] passenger_app');
  });

  it('payload WhatsApp programado: sin SCHEDULED_SOURCE passenger_app', () => {
    const scheduledFor = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const payload = buildApproachOnlyTripInsertPayload({
      pickupLocation: pickup,
      finalDestinationLocation: finalDest,
      passengerName: 'Ana',
      passengerPhone: '543878630173',
      source: 'whatsapp',
      scheduledFor,
      scheduledDisplay: 'mañana a las 10:00',
    });

    expect(payload.status).toBe('scheduled');
    expect(payload.notes).toContain('[SCHEDULED_FOR]');
    expect(payload.notes).not.toContain('[PASSENGER_APP]');
    expect(payload.notes).not.toContain('[SCHEDULED_SOURCE] passenger_app');
  });
});
