const {
  buildGeocodeErrorFingerprint,
  shouldTrackGeocodeError,
} = require('../../src/lib/geocodeErrorLog');

describe('geocodeErrorLog', () => {
  it('detecta errores OSM/Nominatim y fuera de Salta Capital', () => {
    expect(shouldTrackGeocodeError('No se encontró la dirección en OSM/Nominatim')).toBe(true);
    expect(shouldTrackGeocodeError('La dirección debe estar en Salta Capital')).toBe(true);
    expect(shouldTrackGeocodeError('Coordenadas OSM incorrectas para el lugar')).toBe(true);
    expect(shouldTrackGeocodeError('address o placeId requerido')).toBe(false);
  });

  it('genera fingerprint estable para la misma búsqueda', () => {
    const payload = {
      placeId: 'google:abc',
      title: 'Juan Galvez y Domingo Marimon',
      subtitle: 'Salta',
      formattedAddress: 'Juan Galvez y Domingo Marimon, Salta',
      errorMessage: 'No se encontró la dirección en OSM/Nominatim',
    };

    const a = buildGeocodeErrorFingerprint(payload);
    const b = buildGeocodeErrorFingerprint({
      ...payload,
      title: 'juan galvez y domingo marimon',
    });

    expect(a).toBe(b);
  });
});
