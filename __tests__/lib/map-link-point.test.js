const { looksLikeMapLink, readMapLinkPoint, formatMapPointLabel } = require('../../src/lib/mapLinkPoint');

describe('enlace de mapa en el origen', () => {
  const url = 'https://www.google.com/maps?q=-24.7944312,-65.3768616&z=17&hl=es';

  it('reconoce el enlace y conserva el punto', () => {
    expect(looksLikeMapLink(url)).toBe(true);
    const point = readMapLinkPoint(url);
    expect(point.lat).toBe(-24.7944312);
    expect(point.lng).toBe(-65.3768616);
    expect(formatMapPointLabel(point.lat, point.lng)).toBe('-24.7944312, -65.3768616');
  });

  it('no trata una dirección como enlace', () => {
    expect(readMapLinkPoint('Belgrano 1200')).toBeNull();
  });
});
