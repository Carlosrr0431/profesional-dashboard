const {
  resolvePassengerAppPickupFields,
  buildPendingToQueuedUpdate,
} = require('../../src/lib/tripRequeue');

describe('tripRequeue passenger_app', () => {
  const trip = {
    notes: `[APPROACH_ONLY]
[PASSENGER_APP]
[PICKUP_JSON:{"address":"Doctor Mariano Boedo 547, Salta","lat":-24.7952,"lng":-65.3953383}]
[FINAL_DEST_JSON:{"address":"Bartolomé Mitre 200","lat":-24.787,"lng":-65.41}]`,
    origin_address: '-24.79520, -65.39534',
    origin_lat: -24.7952,
    origin_lng: -65.3953383,
  };

  it('restaura origin_address desde PICKUP_JSON si quedó en coordenadas', () => {
    const restored = resolvePassengerAppPickupFields(trip);
    expect(restored.origin_address).toBe('Doctor Mariano Boedo 547, Salta');
    expect(restored.origin_lat).toBe(-24.7952);
  });

  it('buildPendingToQueuedUpdate corrige origin al reencolar', () => {
    const update = buildPendingToQueuedUpdate(trip);
    expect(update.origin_address).toBe('Doctor Mariano Boedo 547, Salta');
    expect(update.status).toBe('queued');
    expect(update.driver_id).toBeNull();
  });
});
