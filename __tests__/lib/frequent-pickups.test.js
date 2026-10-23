import {
  MAP_PICKUP_MIN_COUNT,
  artWeekMinute,
  buildFrequentPickups,
  filterPickups,
  formatArtMinute,
  formatPickupLabel,
  layoutPickupLabels,
  mapPickupCaption,
  pickupKey,
  rankPickupsForTime,
  selectMapPickups,
} from '../../src/lib/frequentPickups';

const TUE = 2 * 1440;
const FRI = 5 * 1440;
const SAT = 6 * 1440;
const hm = (h, m = 0) => h * 60 + m;

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

  it('usa día y hora argentinos y, en programados, la hora del viaje', () => {
    expect(artWeekMinute('2026-10-23T22:15:00Z')).toBe(FRI + hm(19, 15));
    const [item] = buildFrequentPickups([
      wa('Caseros 1088, Salta', -24.7901, -65.4102, at('19:10')),
      { ...wa('Caseros 1088, Salta', -24.7901, -65.4102, at('08:00')), scheduled_for: at('21:30') },
    ]);
    expect(item.times).toEqual([TUE + hm(19, 10), TUE + hm(21, 30)]);
  });

  it('pone primero lo pedido cerca de esta hora, suma más el mismo día de semana y deja el resto por total', () => {
    const list = [
      { id: 'a', count: 10, times: Array(10).fill(TUE + hm(3)) },
      { id: 'b', count: 2, times: [TUE + hm(19, 10), TUE + hm(19, 50)] },
      { id: 'c', count: 3, times: [FRI + hm(18, 20), TUE + hm(9), TUE + hm(9)] },
      { id: 'd', count: 1, times: [TUE + hm(19, 15)] },
      { id: 'e', count: 1, times: [FRI + hm(19, 5)] },
    ];
    const ranked = rankPickupsForTime(list, FRI + hm(19, 15));
    expect(ranked.map((item) => item.id)).toEqual(['b', 'e', 'd', 'c', 'a']);
    expect(ranked.map((item) => item.hourCount)).toEqual([2, 1, 1, 1, 0]);
    expect(ranked.map((item) => item.dayCount)).toEqual([0, 1, 0, 1, 0]);
  });

  it('cruza la medianoche', () => {
    const ranked = rankPickupsForTime([
      { id: 'tarde', count: 5, times: [SAT + hm(12)] },
      { id: 'noche', count: 1, times: [FRI + hm(23, 50)] },
    ], SAT + 20);
    expect(ranked[0]).toMatchObject({ id: 'noche', hourCount: 1, dayCount: 0 });
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

describe('selectMapPickups', () => {
  it('deja solo lugares con 3 o más viajes y coordenadas', () => {
    expect(MAP_PICKUP_MIN_COUNT).toBe(3);
    const shown = selectMapPickups([
      { id: 'a', count: 3, lat: -24.78, lng: -65.42 },
      { id: 'b', count: 2, lat: -24.78, lng: -65.42 },
      { id: 'c', count: 8, lat: NaN, lng: -65.42 },
      { id: 'd', count: 54, lat: -24.79, lng: -65.41 },
    ]);
    expect(shown.map((item) => item.id)).toEqual(['a', 'd']);
  });
});

describe('mapPickupCaption', () => {
  it('muestra calle y altura, y el lugar cuando la dirección es un hospital o un comercio', () => {
    expect(mapPickupCaption('SANTIAGO DEL ESTERO 1432, Salta')).toBe('Santiago del Estero 1432');
    expect(mapPickupCaption('Caseros 1088, A4400 Salta, Argentina')).toBe('Caseros 1088');
    expect(mapPickupCaption('Hospital Militar Salta, Av. Gral. Arenales 1500')).toBe('Hospital Militar Salta');
    expect(mapPickupCaption('Escuela Bernardino Rivadavia, Zuviría 890, Salta')).toBe('Escuela Bernardino Rivadavia');
    expect(mapPickupCaption('FADUA S.A. | Concesionario Oficial Fiat (Venta Directa, Taller y Postventa Salta), Av. Alfredo Palacios 2650'))
      .toBe('FADUA S.A.');
  });

  it('acorta un nombre largo sin cortar a la mitad de una palabra', () => {
    expect(mapPickupCaption('Catedral Basílica de Salta - Santuario del Señor y la Virgen del Milagro, España 558'))
      .toBe('Catedral Basílica de Salta');
    const caption = mapPickupCaption('Centro de Rehabilitación y Medicina Física del Norte Argentino, Leguizamón 400');
    expect(caption.endsWith('…')).toBe(true);
    expect(caption.length).toBeLessThanOrEqual(32);
    expect(caption.startsWith('Centro de Rehabilitación')).toBe(true);
  });
});

describe('layoutPickupLabels', () => {
  const point = (id, count, x, y) => ({
    pickup: { id, count },
    x,
    y,
    caption: 'Caseros 1088',
    side: 'right',
  });

  it('deja el texto del más pedido y esconde el que se le monta encima', () => {
    const labeled = layoutPickupLabels([
      point('cerca', 4, 100, 100),
      point('lejos', 3, 320, 100),
      point('encima', 20, 110, 104),
    ]);
    expect([...labeled].sort()).toEqual(['encima', 'lejos']);
  });

  it('el punto elegido se lee aunque se superponga', () => {
    const labeled = layoutPickupLabels([
      point('grande', 30, 100, 100),
      point('elegido', 3, 108, 100),
    ], { selectedId: 'elegido' });
    expect(labeled.has('grande')).toBe(true);
    expect(labeled.has('elegido')).toBe(true);
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
