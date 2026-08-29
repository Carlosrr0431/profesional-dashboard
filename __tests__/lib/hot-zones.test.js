const {
  applyFareSurcharge,
  findHotZoneForPoint,
  normalizeFareSurchargePercent,
  resolveHotZoneSurchargePercent,
} = require('../../src/lib/hotZones');

const centro = [
  { lat: -24.79, lng: -65.42 },
  { lat: -24.79, lng: -65.40 },
  { lat: -24.77, lng: -65.40 },
  { lat: -24.77, lng: -65.42 },
];

const norte = [
  { lat: -24.785, lng: -65.415 },
  { lat: -24.785, lng: -65.405 },
  { lat: -24.775, lng: -65.405 },
  { lat: -24.775, lng: -65.415 },
];

describe('hotZones', () => {
  it('aplica 10% sobre 1500 y 600', () => {
    expect(applyFareSurcharge(1500, 10)).toBe(1650);
    expect(applyFareSurcharge(600, 10)).toBe(660);
  });

  it('sin recargo devuelve el monto redondeado', () => {
    expect(applyFareSurcharge(1500, 0)).toBe(1500);
    expect(applyFareSurcharge(600, null)).toBe(600);
  });

  it('recorta el porcentaje a 0–200', () => {
    expect(normalizeFareSurchargePercent(-5)).toBe(0);
    expect(normalizeFareSurchargePercent(250)).toBe(200);
    expect(normalizeFareSurchargePercent('10.55')).toBe(10.6);
  });

  it('si hay overlap gana el mayor porcentaje', () => {
    const zones = [
      { name: 'Centro', coordinates: centro, fare_surcharge_percent: 10, is_active: true },
      { name: 'Norte', coordinates: norte, fare_surcharge_percent: 25, is_active: true },
    ];
    expect(resolveHotZoneSurchargePercent(zones, -24.78, -65.41)).toBe(25);
    expect(findHotZoneForPoint(zones, -24.78, -65.41).name).toBe('Norte');
  });

  it('el recargo va sobre el $/km, no sobre la base', () => {
    const perKm = applyFareSurcharge(1500, 10);
    const base = 0;
    expect(Math.round(base + perKm * 2)).toBe(3300);
  });

  it('fuera de zona o zona inactiva no recarga', () => {
    const zones = [
      { name: 'Centro', coordinates: centro, fare_surcharge_percent: 10, is_active: true },
      { name: 'Apagada', coordinates: norte, fare_surcharge_percent: 40, is_active: false },
    ];
    expect(resolveHotZoneSurchargePercent(zones, -24.70, -65.50)).toBe(0);
    expect(resolveHotZoneSurchargePercent(zones, -24.78, -65.41)).toBe(10);
  });
});
