/** @jest-environment node */

import { MAP_LANDMARKS } from '../../src/lib/mapLandmarks';

function metersBetween(a, b) {
  const lat = ((a.lat - b.lat) * Math.PI) / 180;
  const lng = ((a.lng - b.lng) * Math.PI) / 180;
  const mid = ((a.lat + b.lat) * Math.PI) / 360;
  const y = lat * 6371000;
  const x = lng * 6371000 * Math.cos(mid);
  return Math.hypot(x, y);
}

describe('puntos estratégicos del mapa', () => {
  it('muestra el Hospital Papa Francisco sobre Calle 120', () => {
    const hospital = MAP_LANDMARKS.find((place) => place.id === 'hospital_papa_francisco');
    expect(hospital?.label).toBe('Papa Francisco');
    expect(hospital?.lat).toBeCloseTo(-24.840368, 4);
    expect(hospital?.lng).toBeCloseTo(-65.3914422, 4);
  });

  it('incluye plazas, escuelas, hospitales y shoppings que se piden seguido', () => {
    const ids = MAP_LANDMARKS.map((place) => place.id);
    expect(ids).toEqual(expect.arrayContaining([
      'hospital_santa_clara',
      'plaza_9_de_julio',
      'escuela_normal',
      'ucasal',
      'alto_noa',
      'carrefour',
      'catedral',
      'estadio_delmi',
    ]));
    expect(MAP_LANDMARKS.filter((place) => place.kind === 'hospital').length).toBeGreaterThan(8);
    expect(MAP_LANDMARKS.filter((place) => place.kind === 'plaza').length).toBeGreaterThan(3);
    expect(MAP_LANDMARKS.filter((place) => place.kind === 'school').length).toBeGreaterThan(2);
  });

  it('cada lugar está en Salta y separado del resto', () => {
    const ids = new Set();
    for (const place of MAP_LANDMARKS) {
      expect(place.label.length).toBeGreaterThan(2);
      expect(place.lat).toBeGreaterThan(-24.95);
      expect(place.lat).toBeLessThan(-24.72);
      expect(place.lng).toBeGreaterThan(-65.55);
      expect(place.lng).toBeLessThan(-65.35);
      expect(ids.has(place.id)).toBe(false);
      ids.add(place.id);
    }

    let closest = Infinity;
    for (let i = 0; i < MAP_LANDMARKS.length; i += 1) {
      for (let j = i + 1; j < MAP_LANDMARKS.length; j += 1) {
        closest = Math.min(closest, metersBetween(MAP_LANDMARKS[i], MAP_LANDMARKS[j]));
      }
    }
    expect(closest).toBeGreaterThan(80);
  });
});
