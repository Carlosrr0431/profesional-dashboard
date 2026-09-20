/** @jest-environment node */

import {
  estimateActiveTripRemainingMinutes,
  formatActiveTripRemainingLabel,
} from '../../src/lib/activeTripEta';

const NOW = Date.parse('2026-09-20T18:00:00.000Z');

describe('activeTripEta', () => {
  it('estima minutos restantes con GPS hasta el destino si está en curso', () => {
    const minutes = estimateActiveTripRemainingMinutes({
      lat: -24.78,
      lng: -65.42,
      activeTrip: {
        status: 'in_progress',
        destination_lat: -24.80,
        destination_lng: -65.42,
      },
    }, NOW);
    expect(minutes).toBeGreaterThanOrEqual(4);
    expect(minutes).toBeLessThanOrEqual(8);
  });

  it('suma retiro más destino si el chofer va camino al pasajero', () => {
    const minutes = estimateActiveTripRemainingMinutes({
      lat: -24.78,
      lng: -65.42,
      activeTrip: {
        status: 'going_to_pickup',
        origin_lat: -24.79,
        origin_lng: -65.42,
        destination_lat: -24.81,
        destination_lng: -65.42,
      },
    }, NOW);
    expect(minutes).toBeGreaterThanOrEqual(8);
    expect(minutes).toBeLessThanOrEqual(16);
  });

  it('usa la duración restante si no hay coordenadas', () => {
    const minutes = estimateActiveTripRemainingMinutes({
      activeTrip: {
        status: 'in_progress',
        duration_minutes: 20,
        started_at: '2026-09-20T17:50:00.000Z',
      },
    }, NOW);
    expect(minutes).toBe(10);
  });

  it('no inventa tiempo si no hay viaje activo ni datos', () => {
    expect(estimateActiveTripRemainingMinutes({})).toBeNull();
    expect(estimateActiveTripRemainingMinutes({ activeTrip: { status: 'in_progress' } })).toBeNull();
  });

  it('formatea el texto de termina en', () => {
    expect(formatActiveTripRemainingLabel(1)).toBe('Termina en menos de 1 min');
    expect(formatActiveTripRemainingLabel(8)).toBe('Termina en ~8 min');
    expect(formatActiveTripRemainingLabel(65)).toBe('Termina en ~1 h 5 min');
    expect(formatActiveTripRemainingLabel(null)).toBeNull();
  });
});
