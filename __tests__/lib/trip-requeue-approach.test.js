const {
  buildPendingToQueuedUpdate,
  getPendingAcceptRequeueAt,
  PENDING_ACCEPT_REQUEUE_DELAY_SECONDS,
} = require('../../src/lib/tripRequeue');

describe('tripRequeue whatsapp APPROACH_ONLY', () => {
  const trip = {
    notes: `[APPROACH_ONLY]
En cola de espera. Retiro confirmado.
[FINAL_DEST_JSON:{"address":"Calle Tadeo Tadia 500","lat":-24.7948316,"lng":-65.3726791}]`,
    origin_address: 'Juan Gálvez 218, A4400 Salta, Argentina',
    origin_lat: -24.7944121,
    origin_lng: -65.3769205,
    destination_address: 'Calle Tadeo Tadia 500, C. Tadeo Tadia 500',
    destination_lat: -24.7948316,
    destination_lng: -65.3726791,
    driver_id: '941f2855-4dcf-41ea-8101-dbffe344c9c3',
    status: 'pending',
  };

  it('conserva origin_* al reencolar tras timeout o rechazo', () => {
    const update = buildPendingToQueuedUpdate(trip, {
      cancel_reason: 'Tiempo agotado',
    });

    expect(update.origin_address).toBe('Juan Gálvez 218, A4400 Salta, Argentina');
    expect(update.origin_lat).toBe(-24.7944121);
    expect(update.origin_lng).toBe(-65.3769205);
    expect(update.destination_address).toBe('Calle Tadeo Tadia 500');
    expect(update.status).toBe('queued');
    expect(update.driver_id).toBeNull();
  });

  it('si se reencolara un street hail, conserva origin_* y no inventa destino', () => {
    const streetHail = {
      notes: `[STREET_HAIL]
Viaje tomado en calle. Destino a definir.
[PICKUP_JSON:{"lat": -24.7993297, "lng": -65.37836251, "address": "Avenida Eneida Delgadillo, Salta"}]`,
      origin_address: 'Avenida Eneida Delgadillo, Salta',
      origin_lat: -24.7993297,
      origin_lng: -65.37836251,
      destination_address: 'A confirmar',
      destination_lat: null,
      destination_lng: null,
      status: 'pending',
    };

    const update = buildPendingToQueuedUpdate(streetHail);
    expect(update.origin_address).toBe('Avenida Eneida Delgadillo, Salta');
    expect(update.origin_lat).toBe(-24.7993297);
    expect(update.origin_lng).toBe(-65.37836251);
    expect(update.status).toBe('queued');
    expect(update.driver_id).toBeNull();
  });

  it('legacy sin marcadores sigue limpiando origin_* al reencolar', () => {
    const legacyTrip = {
      notes: 'Viaje normal',
      origin_address: '-24.79520, -65.39534',
      origin_lat: -24.7952,
      origin_lng: -65.3953383,
      destination_address: 'Destino pasajero',
      destination_lat: -24.787,
      destination_lng: -65.41,
      status: 'pending',
    };

    const update = buildPendingToQueuedUpdate(legacyTrip);

    expect(update.origin_address).toBeNull();
    expect(update.origin_lat).toBeNull();
    expect(update.origin_lng).toBeNull();
    expect(update.destination_lat).toBe(-24.787);
  });
});

describe('getPendingAcceptRequeueAt', () => {
  it('no agrega backoff extra: el timeout de 15s ya se cumplió', () => {
    expect(PENDING_ACCEPT_REQUEUE_DELAY_SECONDS).toBe(0);
    const nowMs = Date.parse('2026-08-17T18:10:07.077Z');
    expect(getPendingAcceptRequeueAt(nowMs)).toBe('2026-08-17T18:10:07.077Z');
  });

  it('acepta nowMs inválido sin tirar error', () => {
    const iso = getPendingAcceptRequeueAt('no-es-fecha');
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });
});
