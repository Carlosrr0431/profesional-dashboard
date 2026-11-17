import { formatPassengerEta } from '../../src/spa/shared/tripStatus';

const now = new Date('2026-11-17T19:00:00-03:00');

describe('formatPassengerEta', () => {
  test('muestra la llegada del chofer al origen', () => {
    expect(formatPassengerEta({ minutes: 6.2, status: 'going_to_pickup', now }))
      .toBe('Llega en 6 min · 19:06');
  });

  test('muestra la llegada al destino durante el viaje', () => {
    expect(formatPassengerEta({ minutes: 12, status: 'in_progress', now }))
      .toBe('Llegás en 12 min · 19:12');
  });

  test('no inventa una demora si no hay minutos', () => {
    expect(formatPassengerEta({ minutes: null, status: 'going_to_pickup', now })).toBeNull();
  });
});
