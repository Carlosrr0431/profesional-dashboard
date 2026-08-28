const {
  normalizePassengerPhone,
  getPassengerPhoneVariants,
  normalizeDriverPhone,
} = require('../../src/spa/shared/phone');
const { calculateTripPrice, resolvePassengerTariff } = require('../../src/spa/shared/money');
const { isOpenTripStatus, isLiveNavTrip, passengerStatusMeta } = require('../../src/spa/shared/tripStatus');
const { isPickupInActiveZones } = require('../../src/spa/shared/coverage');

describe('SPA passenger phone', () => {
  it('normaliza local, 54 y 549 al canónico 54 + 10', () => {
    expect(normalizePassengerPhone('3871234567')).toBe('543871234567');
    expect(normalizePassengerPhone('5493871234567')).toBe('543871234567');
    expect(normalizePassengerPhone('+54 9 387 123-4567')).toBe('543871234567');
  });

  it('incluye variantes históricas para consultar viajes', () => {
    const variants = getPassengerPhoneVariants('3871234567');
    expect(variants).toEqual(expect.arrayContaining(['543871234567', '3871234567', '5493871234567']));
  });
});

describe('SPA driver phone', () => {
  it('agrega 549 al móvil de 10 dígitos', () => {
    expect(normalizeDriverPhone('3871234567')).toBe('5493871234567');
  });
});

describe('SPA trip helpers', () => {
  it('marca viajes abiertos y cierra completed/cancelled', () => {
    expect(isOpenTripStatus('queued')).toBe(true);
    expect(isOpenTripStatus('going_to_pickup')).toBe(true);
    expect(isOpenTripStatus('completed')).toBe(false);
    expect(isOpenTripStatus('cancelled')).toBe(false);
    expect(isLiveNavTrip('in_progress')).toBe(true);
    expect(isLiveNavTrip('queued')).toBe(false);
  });

  it('devuelve copy en español para el pasajero', () => {
    expect(passengerStatusMeta('going_to_pickup').label).toBe('Conductor en camino');
    expect(passengerStatusMeta('queued').canCancel).toBe(true);
  });

  it('calcula tarifa base + km', () => {
    const tariff = resolvePassengerTariff({
      passenger_app_tariff_base: '500',
      passenger_app_tariff_per_km: '1000',
    });
    expect(calculateTripPrice({ ...tariff, distanceKm: 4.2 })).toBe(4700);
  });

  it('sin zonas activas deja pasar el retiro', () => {
    expect(isPickupInActiveZones([], -24.78, -65.42)).toBe(true);
  });
});

const { tripPickupPoint, tripNavTarget } = require('../../src/spa/shared/tripPoints');
const { remainingPolyline, polylineHeading, bearingDegrees, snapToPolyline, smoothAngle, offsetAlongBearing } = require('../../src/spa/shared/nav');

describe('SPA driver navigation', () => {
  it('usa origin como retiro en viajes de la app de pasajeros', () => {
    const pickup = tripPickupPoint({
      notes: '[PASSENGER_APP]',
      origin_lat: -24.78,
      origin_lng: -65.42,
      origin_address: 'Belgrano 100',
      destination_lat: -24.79,
      destination_lng: -65.41,
      destination_address: 'Alberdi 200',
      status: 'going_to_pickup',
    });
    expect(pickup).toEqual(expect.objectContaining({
      lat: -24.78,
      lng: -65.42,
      address: 'Belgrano 100',
    }));
  });

  it('navega al destino cuando el viaje está en curso', () => {
    const target = tripNavTarget({
      notes: '[PASSENGER_APP]',
      origin_lat: -24.78,
      origin_lng: -65.42,
      origin_address: 'Belgrano 100',
      destination_lat: -24.79,
      destination_lng: -65.41,
      destination_address: 'Alberdi 200',
      status: 'in_progress',
    });
    expect(target.address).toBe('Alberdi 200');
  });

  it('recorta la polilínea desde la posición actual y calcula rumbo', () => {
    const line = [
      [-65.42, -24.79],
      [-65.41, -24.78],
      [-65.40, -24.77],
    ];
    const remaining = remainingPolyline(line, -24.78, -65.41);
    expect(remaining[0]).toEqual([-65.41, -24.78]);
    expect(remaining.length).toBeGreaterThanOrEqual(2);
    expect(polylineHeading([[-65.42, -24.78], [-65.42, -24.79]])).toBeGreaterThan(0);
    expect(bearingDegrees({ lat: -24.78, lng: -65.42 }, { lat: -24.79, lng: -65.42 })).toBeGreaterThan(0);
  });

  it('pega el puck al segmento más cercano de la polilínea', () => {
    const line = [
      [-65.42, -24.78],
      [-65.41, -24.78],
    ];
    const snapped = snapToPolyline(line, -24.7804, -65.415);
    expect(snapped.lat).toBeCloseTo(-24.78, 5);
    expect(snapped.lng).toBeCloseTo(-65.415, 4);
  });

  it('suaviza el rumbo y adelanta la cámara sobre la polilínea', () => {
    expect(smoothAngle(10, 40, 0.5)).toBeCloseTo(25, 5);
    const ahead = offsetAlongBearing(-24.78, -65.42, 0, 100);
    expect(ahead.lat).toBeGreaterThan(-24.78);
  });
});

const { isTripChatAvailable, buildTripTrackingUrl, mergeChatMessage } = require('../../src/spa/shared/tripChat');

describe('SPA trip chat helpers', () => {
  it('habilita el chat solo con viaje aceptado o en curso', () => {
    expect(isTripChatAvailable('going_to_pickup')).toBe(true);
    expect(isTripChatAvailable('in_progress')).toBe(true);
    expect(isTripChatAvailable('pending')).toBe(false);
    expect(isTripChatAvailable('completed')).toBe(false);
  });

  it('arma el enlace público de seguimiento', () => {
    expect(buildTripTrackingUrl('abc-123')).toMatch(/\/seguimiento\/abc-123$/);
  });

  it('fusiona mensajes del chat por id o client_id', () => {
    const first = mergeChatMessage([], { id: '1', client_id: 'p-1', body: 'hola', created_at: '2026-01-01T10:00:00Z' });
    const next = mergeChatMessage(first, { id: '1', client_id: 'p-1', body: 'hola', seen_at: '2026-01-01T10:01:00Z', created_at: '2026-01-01T10:00:00Z' });
    expect(next).toHaveLength(1);
    expect(next[0].seen_at).toBeTruthy();
  });
});

const {
  remainingAcceptSeconds,
  formatOfferDistance,
  getOfferDisplay,
} = require('../../src/spa/conductor/tripOffer');

describe('SPA oferta de viaje', () => {
  it('cuenta 15s si no hay assigned_at', () => {
    expect(remainingAcceptSeconds({ id: '1' }, Date.now())).toBe(15);
  });

  it('resta los segundos desde assigned_at y no baja de 0', () => {
    const now = Date.parse('2026-08-27T22:00:15.000Z');
    expect(remainingAcceptSeconds({ assigned_at: '2026-08-27T22:00:00.000Z' }, now)).toBe(0);
    expect(remainingAcceptSeconds({ assigned_at: '2026-08-27T22:00:10.000Z' }, now)).toBe(10);
  });

  it('formatea distancia corta en metros', () => {
    expect(formatOfferDistance(0.35)).toBe('350 m');
    expect(formatOfferDistance(4.2)).toBe('4.2 km');
  });

  it('usa destino a definir en viajes solo de aproximación', () => {
    const display = getOfferDisplay({
      notes: '[APPROACH_ONLY]',
      origin_address: 'Juan Gálvez 350',
      origin_lat: -24.78,
      origin_lng: -65.42,
      destination_address: 'Juan Gálvez 350',
      destination_lat: -24.78,
      destination_lng: -65.42,
    });
    expect(display.pickupAddress).toMatch(/Juan Gálvez/i);
    expect(display.destinationAddress).toBe('A definir al subir al pasajero');
  });
});

const {
  minScheduleDate,
  toDatetimeLocalValue,
  parseDatetimeLocalValue,
  formatScheduleDisplay,
  isScheduleValid,
} = require('../../src/spa/pasajero/scheduleTrip');

describe('SPA programación de viaje', () => {
  it('pide al menos 30 minutos de anticipación', () => {
    const now = new Date('2026-08-27T22:00:00');
    expect(isScheduleValid(new Date('2026-08-27T22:20:00'), now)).toBe(false);
    expect(isScheduleValid(new Date('2026-08-27T22:30:00'), now)).toBe(true);
    expect(minScheduleDate(now).getTime()).toBe(now.getTime() + 30 * 60 * 1000);
  });

  it('convierte datetime-local sin perder hora local', () => {
    const value = '2026-08-27T22:45';
    const parsed = parseDatetimeLocalValue(value);
    expect(toDatetimeLocalValue(parsed)).toBe(value);
    expect(formatScheduleDisplay(parsed)).toMatch(/jueves 27\/08 a las 22:45/);
  });
});

const { chromeToMapPadding, routeBounds } = require('../../src/spa/shared/mapFit');

describe('SPA encuadre de ruta', () => {
  it('incluye origen y destino aunque la polilínea sea corta', () => {
    const bounds = routeBounds(
      [[-65.42, -24.78], [-65.421, -24.781]],
      { lat: -24.79, lng: -65.43 },
      { latitude: -24.77, longitude: -65.41 },
    );
    expect(bounds[0][0]).toBe(-65.43);
    expect(bounds[0][1]).toBe(-24.79);
    expect(bounds[1][0]).toBe(-65.41);
    expect(bounds[1][1]).toBe(-24.77);
  });

  it('usa el alto real del sheet y deja mapa visible', () => {
    const padding = chromeToMapPadding({ top: 64, bottom: 300 }, { width: 390, height: 844 });
    expect(padding.bottom).toBeGreaterThanOrEqual(300);
    expect(padding.top + padding.bottom).toBeLessThan(844 - 160);
  });
});

