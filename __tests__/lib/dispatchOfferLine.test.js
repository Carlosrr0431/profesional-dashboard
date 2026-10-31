import {
  OFFER_LINE_SEPARATION_KM,
  clusterTripsForOfferLine,
  prepareOfferLine,
  stampDispatchOfferLine,
} from '../../src/lib/dispatchOfferLine';

function trip(id, createdAt, extra = {}) {
  return { id, createdAt, lat: -24.79, lng: -65.41, turn: 0, ...extra };
}

describe('fila de viajes que comparten choferes', () => {
  test('empieza por el más viejo y sigue hacia el más nuevo', () => {
    const { head, order } = prepareOfferLine([
      trip('nuevo', '2026-10-31T12:02:00.000Z'),
      trip('viejo', '2026-10-31T12:00:00.000Z'),
      trip('medio', '2026-10-31T12:01:00.000Z'),
    ]);

    expect(order.map((item) => item.id)).toEqual(['viejo', 'medio', 'nuevo']);
    expect(head.id).toBe('viejo');
  });

  test('después de ofrecer el primero, el siguiente es el que sigue en la fila', () => {
    const shown = stampDispatchOfferLine({}, new Date('2026-10-31T12:00:30.000Z'));
    const { head } = prepareOfferLine([
      trip('viejo', '2026-10-31T12:00:00.000Z', { turn: shown.dispatch_line_turn }),
      trip('medio', '2026-10-31T12:01:00.000Z'),
      trip('nuevo', '2026-10-31T12:02:00.000Z'),
    ]);

    expect(head.id).toBe('medio');
  });

  test('al llegar al último, la próxima vuelta empieza otra vez por el más viejo', () => {
    const { head } = prepareOfferLine([
      trip('viejo', '2026-10-31T12:00:00.000Z', { turn: 1 }),
      trip('medio', '2026-10-31T12:01:00.000Z', { turn: 1 }),
      trip('nuevo', '2026-10-31T12:02:00.000Z', { turn: 1 }),
    ]);

    expect(head.id).toBe('viejo');
  });

  test('un viaje nuevo entra al final de la vuelta en curso', () => {
    const { head, order, updates } = prepareOfferLine([
      trip('viejo', '2026-10-31T12:00:00.000Z', { turn: 1, offeredAt: '2026-10-31T12:03:00.000Z' }),
      trip('medio', '2026-10-31T12:01:00.000Z', { turn: 1, offeredAt: '2026-10-31T12:03:20.000Z' }),
      trip('recien', '2026-10-31T12:05:00.000Z', { turn: 0 }),
    ]);

    expect(updates).toEqual([{ id: 'recien', turn: 1 }]);
    expect(order.map((item) => item.id)).toEqual(['viejo', 'medio', 'recien']);
    expect(head.id).toBe('viejo');
  });

  test('si el primero ya fue aceptado, la fila sigue por el que queda más viejo', () => {
    const { head, order } = prepareOfferLine([
      trip('medio', '2026-10-31T12:01:00.000Z'),
      trip('nuevo', '2026-10-31T12:02:00.000Z'),
    ]);

    expect(order.map((item) => item.id)).toEqual(['medio', 'nuevo']);
    expect(head.id).toBe('medio');
  });

  test('viajes a más de 4 km no comparten fila; los cercanos sí', () => {
    const groups = clusterTripsForOfferLine([
      trip('a', '2026-10-31T12:00:00.000Z', { lat: -24.79, lng: -65.41 }),
      trip('b', '2026-10-31T12:01:00.000Z', { lat: -24.791, lng: -65.411 }),
      trip('lejos', '2026-10-31T12:02:00.000Z', { lat: -24.90, lng: -65.41 }),
    ], OFFER_LINE_SEPARATION_KM);

    const ids = groups.map((group) => group.map((item) => item.id).sort());
    expect(ids).toEqual([['a', 'b'], ['lejos']]);
  });
});
