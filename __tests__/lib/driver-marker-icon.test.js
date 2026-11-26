import { buildDriverMarkerIconSpec } from '../../src/lib/driverMarkerIcon';

describe('buildDriverMarkerIconSpec', () => {
  it('el móvil 1 se ve como 1, no como A', () => {
    const spec = buildDriverMarkerIconSpec({
      driverNumber: 1,
      isAssignedDriver: true,
    }, false, false);
    expect(decodeURIComponent(spec.url)).toContain('>1<');
    expect(decodeURIComponent(spec.url)).not.toContain('>A<');
  });

  it('un asignado sin número no muestra la letra A', () => {
    const spec = buildDriverMarkerIconSpec({
      driverNumber: null,
      isAssignedDriver: true,
    }, false, false);
    expect(decodeURIComponent(spec.url)).not.toContain('>A<');
  });
});
