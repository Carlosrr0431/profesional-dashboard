const { mapGeorefDireccion, probeHeightsForRange, projectHeightOnAnchors } = require('../../shared/geo/georef');

const CHILE_ANCHORS = [
  { height: 1400, lat: -24.806299109, lng: -65.417550881 },
  { height: 1600, lat: -24.810119726, lng: -65.419232198 },
];

const BEIRO_ANCHORS = [
  { height: 1000, lat: -24.775871342, lng: -65.443445472 },
  { height: 1200, lat: -24.772268966, lng: -65.445768271 },
];

describe('georef', () => {
  it('descarta direcciones sin coordenadas reales (null no debe mapearse a 0,0)', () => {
    const mapped = mapGeorefDireccion({
      nomenclatura: 'AV BOLIVIA 200, Salta, Capital, Salta',
      altura: { valor: 200 },
      calle: { nombre: 'AV BOLIVIA' },
      localidad_censal: { nombre: 'Salta' },
      provincia: { nombre: 'Salta' },
      ubicacion: { lat: null, lon: null },
    });

    expect(mapped).toBeNull();
  });

  it('acepta coordenadas válidas de Salta', () => {
    const mapped = mapGeorefDireccion({
      nomenclatura: 'AV ENTRE RIOS 200, Salta, Capital, Salta',
      altura: { valor: 200 },
      calle: { nombre: 'AV ENTRE RIOS' },
      localidad_censal: { nombre: 'Salta' },
      provincia: { nombre: 'Salta' },
      ubicacion: { lat: -24.781482624, lon: -65.404901193 },
    });

    expect(mapped?.lat).toBeCloseTo(-24.781482624, 5);
    expect(mapped?.lng).toBeCloseTo(-65.404901193, 5);
  });

  it('arma las alturas de referencia cerca del final del padrón', () => {
    expect(probeHeightsForRange({
      inicio: { derecha: 0, izquierda: 0 },
      fin: { derecha: 1600, izquierda: 1599 },
    })).toEqual([1600, 1500, 1400, 1200]);
  });

  it('no estira la avenida Chile usando solo el último centenar', () => {
    const eightHundred = projectHeightOnAnchors(800, [
      ...CHILE_ANCHORS,
      { height: 1500, lat: -24.809283273, lng: -65.418867187 },
    ]);
    expect(eightHundred).not.toBeNull();
    expect(eightHundred.lat).toBeGreaterThan(CHILE_ANCHORS[0].lat);
  });

  it('separa alturas de avenida Chile en vez de clavarlas en el mismo punto', () => {
    const eightHundred = projectHeightOnAnchors(800, CHILE_ANCHORS);
    const twoThousand = projectHeightOnAnchors(2000, CHILE_ANCHORS);

    expect(eightHundred.lat).toBeGreaterThan(CHILE_ANCHORS[0].lat);
    expect(twoThousand.lat).toBeLessThan(CHILE_ANCHORS[1].lat);
    expect(Math.abs(eightHundred.lat - twoThousand.lat)).toBeGreaterThan(0.01);
  });

  it('no extrapola una altura de Grand Bourg que queda a más de 1,6 km', () => {
    expect(projectHeightOnAnchors(100, BEIRO_ANCHORS)).toBeNull();
    expect(projectHeightOnAnchors(500, BEIRO_ANCHORS)).not.toBeNull();
  });
});
