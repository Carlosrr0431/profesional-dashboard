/** @jest-environment node */

import { MAP_LANDMARKS } from '../../src/lib/mapLandmarks';

describe('puntos estratégicos del mapa', () => {
  it('muestra el Hospital Papa Francisco sobre Calle 120', () => {
    const hospital = MAP_LANDMARKS.find((place) => place.id === 'hospital_papa_francisco');
    expect(hospital?.label).toBe('Papa Francisco');
    expect(hospital?.kind).toBe('hospital');
    expect(hospital?.lat).toBeCloseTo(-24.840368, 4);
    expect(hospital?.lng).toBeCloseTo(-65.3914422, 4);
  });

  it('tiene nombre y coordenada en cada lugar', () => {
    const ids = new Set();
    for (const place of MAP_LANDMARKS) {
      expect(place.label.length).toBeGreaterThan(2);
      expect(Number.isFinite(place.lat)).toBe(true);
      expect(Number.isFinite(place.lng)).toBe(true);
      expect(place.lat).toBeGreaterThan(-25);
      expect(place.lat).toBeLessThan(-24.6);
      expect(place.lng).toBeGreaterThan(-65.6);
      expect(place.lng).toBeLessThan(-65.3);
      expect(ids.has(place.id)).toBe(false);
      ids.add(place.id);
    }
    expect(MAP_LANDMARKS.length).toBeGreaterThan(4);
  });
});
