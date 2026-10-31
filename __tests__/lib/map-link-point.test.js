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

  it('el enlace /place usa el pin 3d y no la camara', () => {
    const url = 'https://www.google.com/maps/place/24%C2%B051\'09.8%22S+65%C2%B026\'19.4%22W/@-24.852733,-65.4412819,17z/data=!3m1!4b1!4m4!3m3!8m2!3d-24.852733!4d-65.438707?hl=es&entry=ttu&g_ep=EgoyMDI2MTAyOC4wIKXMDSoASAFQAw%3D%3D';
    const point = readMapLinkPoint(url);
    expect(point.lat).toBeCloseTo(-24.852733, 6);
    expect(point.lng).toBeCloseTo(-65.438707, 6);
    expect(point.lng).not.toBeCloseTo(-65.4412819, 4);
    expect(formatMapPointLabel(point.lat, point.lng)).toBe('-24.852733, -65.438707');
  });

  it('no trata una dirección como enlace', () => {
    expect(readMapLinkPoint('Belgrano 1200')).toBeNull();
  });
});
