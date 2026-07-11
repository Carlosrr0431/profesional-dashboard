const {
  isPointInPolygon,
  isPickupInActiveZones,
} = require('../../shared/geo/serviceZones');

describe('serviceZones', () => {
  const saltaBox = [
    { lat: -24.75, lng: -65.45 },
    { lat: -24.75, lng: -65.40 },
    { lat: -24.80, lng: -65.40 },
    { lat: -24.80, lng: -65.45 },
  ];

  it('detecta punto dentro del polígono', () => {
    expect(isPointInPolygon(-24.77, -65.42, saltaBox)).toBe(true);
  });

  it('detecta punto fuera del polígono', () => {
    expect(isPointInPolygon(-24.70, -65.42, saltaBox)).toBe(false);
  });

  it('sin zonas activas acepta cualquier recogida', () => {
    expect(isPickupInActiveZones([], -24.70, -65.42)).toBe(true);
    expect(isPickupInActiveZones(null, -24.70, -65.42)).toBe(true);
  });

  it('con zonas activas valida cobertura', () => {
    const zones = [{ id: '1', is_active: true, coordinates: saltaBox }];
    expect(isPickupInActiveZones(zones, -24.77, -65.42)).toBe(true);
    expect(isPickupInActiveZones(zones, -24.70, -65.42)).toBe(false);
  });

  it('ignora zonas inactivas o con polígono inválido', () => {
    const zones = [
      { id: '1', is_active: false, coordinates: saltaBox },
      { id: '2', is_active: true, coordinates: [{ lat: 1, lng: 1 }] },
    ];
    expect(isPickupInActiveZones(zones, -24.70, -65.42)).toBe(true);
  });
});
