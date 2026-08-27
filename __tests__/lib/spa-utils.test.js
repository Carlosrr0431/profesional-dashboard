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
