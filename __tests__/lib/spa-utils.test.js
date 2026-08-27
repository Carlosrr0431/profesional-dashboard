const {
  normalizePassengerPhone,
  getPassengerPhoneVariants,
  normalizeDriverPhone,
} = require('../../src/spa/shared/phone');
const { calculateTripPrice, resolvePassengerTariff } = require('../../src/spa/shared/money');
const { isOpenTripStatus, passengerStatusMeta } = require('../../src/spa/shared/tripStatus');
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
const { remainingPolyline, polylineHeading, bearingDegrees, snapToPolyline } = require('../../src/spa/shared/nav');

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
});

