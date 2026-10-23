import {
  artMinuteOfDay,
  buildFrequentPickups,
  filterPickups,
  formatArtMinute,
  formatPickupLabel,
  pickupKey,
  rankPickupsForMinute,
} from '../../src/lib/frequentPickups';

function wa(address, lat, lng, createdAt = '2026-10-01T12:00:00Z') {
  return {
    status: 'completed',
    origin_address: address,
    origin_lat: lat,
    origin_lng: lng,
    notes: '[APPROACH_ONLY]',
    created_at: createdAt,
  };
}

describe('pickupKey', () => {
  it('une la misma calle y altura escrita distinto', () => {
    expect(pickupKey('Nefrología Rennius, Av. Belgrano 1668')).toBe('belgrano 1668');
    expect(pickupKey('AV GRL BELGRANO 1668, Salta')).toBe('belgrano 1668');
    expect(pickupKey('Avenida Belgrano 1668, A4400 Salta, Argentina')).toBe('belgrano 1668');
  });

  it('ordena las esquinas', () => {
    expect(pickupKey('Vicente López & Leguizamón')).toBe(pickupKey('Leguizamón y Vicente López'));
  });
});

describe('buildFrequentPickups', () => {
  it('cuenta por lugar, ordena por total y usa el nombre más usado', () => {
    const list = buildFrequentPickups([
      wa('Nefrología Rennius, Av. Belgrano 1668', -24.7855, -65.4201),
      wa('Nefrología Rennius, Av. Belgrano 1668', -24.7855, -65.4201),
      wa('AV GRL BELGRANO 1668, Salta', -24.78552, -65.42015, '2026-10-05T12:00:00Z'),
      wa('Caseros 1088, Salta', -24.7901, -65.4102),
    ]);

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      address: 'Nefrología Rennius, Av. Belgrano 1668',
      lat: -24.7855,
      lng: -65.4201,
      count: 3,
      lastAt: '2026-10-05T12:00:00Z',
    });
    expect(list[1]).toMatchObject({ address: 'Caseros 1088, Salta', count: 1 });
  });

  it('separa calles homónimas lejanas y descarta retiros sin dirección o fuera de zona', () => {
    const list = buildFrequentPickups([
      wa('Pje. 12 de Octubre 2512', -24.8, -65.43),
      wa('12 de Octubre 2512', -24.77, -65.40),
      wa('-24.78000, -65.42000', -24.78, -65.42),
      wa('Lejos 100', -25.5, -64.9),
    ], { isAllowed: (lat) => lat > -25 });

    expect(list.map((item) => item.address).sort()).toEqual(['12 de Octubre 2512', 'Pje. 12 de Octubre 2512']);
  });
});

describe('franja horaria', () => {
  const at = (hhmm) => `2026-10-20T${hhmm}:00-03:00`;

  it('usa la hora argentina y, en programados, la hora del viaje', () => {
    expect(artMinuteOfDay('2026-10-23T22:15:00Z')).toBe(19 * 60 + 15);
    const [item] = buildFrequentPickups([
      wa('Caseros 1088, Salta', -24.7901, -65.4102, at('19:10')),
      { ...wa('Caseros 1088, Salta', -24.7901, -65.4102, at('08:00')), scheduled_for: at('21:30') },
    ]);
    expect(item.times).toEqual([19 * 60 + 10, 21 * 60 + 30]);
  });

  it('pone primero lo pedido cerca de esta hora y después el resto por total', () => {
    const list = [
      { id: 'a', count: 10, times: Array(10).fill(3 * 60) },
      { id: 'b', count: 2, times: [19 * 60 + 10, 19 * 60 + 50] },
      { id: 'c', count: 3, times: [18 * 60 + 20, 9 * 60, 9 * 60] },
      { id: 'd', count: 1, times: [19 * 60 + 15] },
    ];
    const ranked = rankPickupsForMinute(list, 19 * 60 + 15);
    expect(ranked.map((item) => item.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(ranked.map((item) => item.hourCount)).toEqual([2, 1, 1, 0]);
  });

  it('cruza la medianoche', () => {
    const ranked = rankPickupsForMinute([
      { id: 'tarde', count: 5, times: [12 * 60] },
      { id: 'noche', count: 1, times: [23 * 60 + 50] },
    ], 20);
    expect(ranked[0]).toMatchObject({ id: 'noche', hourCount: 1 });
    expect(formatArtMinute(20 - 60)).toBe('23:20');
    expect(formatArtMinute(23 * 60 + 30 + 60)).toBe('00:30');
  });
});

describe('filterPickups', () => {
  const list = buildFrequentPickups([
    wa('Terminal de Ómnibus de Salta, Av. Hipólito Yrigoyen 339', -24.7955, -65.3985),
    wa('Terminal de Ómnibus de Salta, Av. Hipólito Yrigoyen 339', -24.7955, -65.3985),
    wa('Nefrología Rennius, Av. Belgrano 1668', -24.7855, -65.4201),
    wa('AV GRL BELGRANO 1668, Salta', -24.7855, -65.4201),
    wa('AV GRL BELGRANO 1668, Salta', -24.7855, -65.4201),
    wa('Caseros 1088, Salta', -24.7901, -65.4102),
  ]);

  it('sin texto devuelve los más pedidos', () => {
    expect(filterPickups(list, '').map((item) => item.count)).toEqual([3, 2, 1]);
  });

  it('busca sin acentos, en cualquier orden y por cualquier nombre usado', () => {
    expect(filterPickups(list, 'omnibus')[0].address).toContain('Terminal');
    expect(filterPickups(list, '1668 belg')).toHaveLength(1);
    expect(filterPickups(list, 'rennius')[0].address).toBe('AV GRL BELGRANO 1668, Salta');
    expect(filterPickups(list, 'caseros 1088')).toHaveLength(1);
    expect(filterPickups(list, 'xyz')).toEqual([]);
  });
});

describe('formatPickupLabel', () => {
  it('quita la ciudad y suaviza las mayúsculas', () => {
    expect(formatPickupLabel('SANTIAGO DEL ESTERO 1432, Salta')).toEqual({ title: 'Santiago del Estero 1432', detail: '' });
    expect(formatPickupLabel('Hospital Militar Salta, Av. Gral. Arenales 1500')).toEqual({
      title: 'Hospital Militar Salta',
      detail: 'Av. Gral. Arenales 1500',
    });
    expect(formatPickupLabel('Pasaje Soria 1961, Pje. Soria 1961')).toEqual({ title: 'Pasaje Soria 1961', detail: '' });
    expect(formatPickupLabel('Caseros 1467, A4400 Salta, Argentina')).toEqual({ title: 'Caseros 1467', detail: '' });
  });

  it('no corta en comas entre paréntesis ni pierde partes de la calle', () => {
    const fadua = 'FADUA S.A. | Concesionario Oficial Fiat (Venta Directa, Taller y Postventa Salta), Av. Alfredo Palacios 2650';
    expect(formatPickupLabel(fadua)).toEqual({
      title: 'FADUA S.A. | Concesionario Oficial Fiat',
      detail: 'Av. Alfredo Palacios 2650',
    });
    expect(pickupKey(fadua)).toBe('alfredo palacios 2650');
    expect(formatPickupLabel('La Casona del Molino, Cnel, Luis Burela, Salta').detail).toBe('Cnel, Luis Burela');
  });
});
