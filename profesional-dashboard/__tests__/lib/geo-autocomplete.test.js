const { installGeoFetchMock } = require('../helpers/geo-fetch-mock');
const { autocompleteAddressSalta, geocodeAddress, getPlaceDetails } = require('../../shared/geo/nominatim');

const FORBIDDEN_GOOGLE_URL_PATTERNS = [
  /textsearch/i,
  /findplacefromtext/i,
  /places:searchText/i,
  /searchNearby/i,
  /maps\.googleapis\.com\/maps\/api\/place/i,
  /maps\.googleapis\.com\/maps\/api\/geocode/i,
];

const FORBIDDEN_PLACE_DETAILS_MASK_FRAGMENTS = [
  'displayName',
  'googleMapsUri',
  'rating',
  'reviews',
  'photos',
  'websiteUri',
  'nationalPhoneNumber',
];

const ALLOWED_PLACE_DETAILS_ESSENTIALS_FIELDS = ['id', 'formattedAddress', 'location', 'types'];

function assertAllowedGooglePlacesSkus(fetchMock) {
  const googleCalls = fetchMock.mock.calls.filter(([url]) => (
    String(url).includes('googleapis.com')
  ));

  for (const [url, options] of googleCalls) {
    const urlStr = String(url);

    for (const pattern of FORBIDDEN_GOOGLE_URL_PATTERNS) {
      expect(urlStr).not.toMatch(pattern);
    }

    if (urlStr.includes('places.googleapis.com/v1/places/') && !urlStr.includes('autocomplete')) {
      const mask = String(options?.headers?.['X-Goog-FieldMask'] || '');
      const fields = mask.split(',').map((field) => field.trim()).filter(Boolean);
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(ALLOWED_PLACE_DETAILS_ESSENTIALS_FIELDS).toContain(field);
      }
      for (const fragment of FORBIDDEN_PLACE_DETAILS_MASK_FRAGMENTS) {
        expect(mask).not.toContain(fragment);
      }
      expect(mask).toContain('location');
      expect(mask).toContain('formattedAddress');
    }
  }

  const autocompleteCalls = googleCalls.filter(([url]) => url.includes('places:autocomplete'));
  const placeDetailsCalls = googleCalls.filter(([url]) => (
    url.includes('places.googleapis.com/v1/places/')
    && !url.includes('autocomplete')
  ));
  const legacyOrPaidCalls = googleCalls.filter(([url]) => (
    !url.includes('places.googleapis.com/v1/')
  ));

  expect(legacyOrPaidCalls.length).toBe(0);
  expect(autocompleteCalls.length + placeDetailsCalls.length).toBe(googleCalls.length);
}

describe('geo autocomplete', () => {
  beforeEach(() => {
    installGeoFetchMock();
  });

  it('usa Google Autocomplete (New) para POIs como Unsa', async () => {
    const results = await autocompleteAddressSalta('Unsa', 5, { sessionToken: 'test-session-1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((item) => /unsa|universidad nacional de salta/i.test(item.title))).toBe(true);
    expect(results.every((item) => String(item.placeId).startsWith('google:'))).toBe(true);

    const googleCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('places:autocomplete'));
    const findPlaceCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('findplacefromtext'));
    expect(googleCalls.length).toBeGreaterThan(0);
    expect(findPlaceCalls.length).toBe(0);
  });

  it('para shoping devuelve opciones distintas con subtítulos estilo Google Maps', async () => {
    const results = await autocompleteAddressSalta('shoping', 6, { sessionToken: 'test-session-2' });
    const labels = results.map((item) => item.address);
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.some((item) => /shopping salta/i.test(item))).toBe(true);
    expect(labels.some((item) => /alto noa/i.test(item))).toBe(true);
    expect(results.every((item) => String(item.placeId).startsWith('google:'))).toBe(true);
    expect(results.some((item) => /buenos aires 88/i.test(item.subtitle || ''))).toBe(true);
  });

  it('para grido devuelve subtítulos con calle y altura sin Place Details de pago', async () => {
    const results = await autocompleteAddressSalta('grido', 5, { sessionToken: 'test-session-3' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => String(item.placeId).startsWith('google:'))).toBe(true);
    expect(results.some((item) => /grido/i.test(item.title))).toBe(true);
    expect(results.some((item) => /\b395\b/.test(item.subtitle || ''))).toBe(true);

    const basicDataCalls = global.fetch.mock.calls.filter(([url]) => (
      String(url).includes('places.googleapis.com/v1/places/')
      && !String(url).includes('autocomplete')
    ));
    expect(basicDataCalls.length).toBe(0);
  });

  it('obtiene coords vía Place Details Essentials sin Nominatim', async () => {
    const details = await getPlaceDetails('google:google-unsa', {
      sessionToken: 'test-session-4',
      formattedAddress: 'Universidad Nacional de Salta, Av. Bolivia, Salta, Argentina',
      title: 'Universidad Nacional de Salta',
      subtitle: 'Av. Bolivia, Salta, Argentina',
    });

    expect(details.lat).toBeCloseTo(-24.735437, 3);
    expect(details.lng).toBeCloseTo(-65.386858, 3);
    expect(/unsa|universidad nacional de salta/i.test(details.formattedAddress)).toBe(true);

    const essentialsCalls = global.fetch.mock.calls.filter(([url, options]) => (
      String(url).includes('places.googleapis.com/v1/places/google-unsa')
      && String(options?.headers?.['X-Goog-FieldMask'] || '').includes('location')
    ));
    expect(essentialsCalls.length).toBe(1);

    const nominatimCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('nominatim'));
    expect(nominatimCalls.length).toBe(0);
  });

  it('para jaraba conserva el nombre del POI desde Google Places', async () => {
    const details = await getPlaceDetails('google:google-jaraba-poi', {
      sessionToken: 'test-session-jaraba',
      formattedAddress: 'Imagenes Jaraba, Pueyrredón, Salta',
      title: 'Imagenes Jaraba',
      subtitle: 'Pueyrredón, Salta',
    });

    expect(details.formattedAddress).toContain('Imagenes Jaraba');
    expect(details.lat).toBeCloseTo(-24.7833, 3);
    expect(details.lng).toBeCloseTo(-65.4063, 3);
    assertAllowedGooglePlacesSkus(global.fetch);
  });

  it('no usa Place Details Pro, Text Search Pro ni Places API Legacy en Autocomplete', async () => {
    await autocompleteAddressSalta('jaraba', 5, { sessionToken: 'billing-audit-session' });

    assertAllowedGooglePlacesSkus(global.fetch);

    const placeDetailsCalls = global.fetch.mock.calls.filter(([url]) => (
      String(url).includes('places.googleapis.com/v1/places/')
      && !String(url).includes('autocomplete')
    ));
    expect(placeDetailsCalls.length).toBe(0);

    const nominatimCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('nominatim'));
    expect(nominatimCalls.length).toBe(0);
  });

  it('para plaza ceferino no geocodifica en plaza 9 de julio', async () => {
    const details = await getPlaceDetails('google:google-plaza-ceferino', {
      sessionToken: 'test-session-plaza-ceferino',
      formattedAddress: 'Plaza Ceferino, Barrio Don Ceferino, Salta',
      title: 'Plaza Ceferino',
      subtitle: 'Barrio Don Ceferino, Salta',
    });

    expect(details.formattedAddress).toContain('Plaza Ceferino');
    expect(details.lat).toBeCloseTo(-24.8122, 3);
    expect(details.lng).toBeCloseTo(-65.4101, 3);
    expect(details.lat).not.toBeCloseTo(-24.7893, 3);
  });

  it('para el punto shopping geocodifica en Finca Yerba Buena San Lorenzo, no Alto NOA', async () => {
    const details = await getPlaceDetails('google:google-punto-shopping', {
      sessionToken: 'test-session-punto-shopping',
      formattedAddress: 'El Punto Shopping, Av. Finca Yerba Buena 4401, San Lorenzo, Salta',
      title: 'El Punto Shopping',
      subtitle: 'Av. Finca Yerba Buena 4401, San Lorenzo, Salta',
    });

    expect(details.formattedAddress).toContain('El Punto Shopping');
    expect(details.lat).toBeCloseTo(-24.7918, 3);
    expect(details.lng).toBeCloseTo(-65.4854, 3);
    expect(details.lat).not.toBeCloseTo(-24.7808, 3);
    expect(details.lng).not.toBeCloseTo(-65.4024, 3);
  });

  it('para la fransisca geocodifica vía Place Details Essentials sin TomTom', async () => {
    const details = await getPlaceDetails('google:google-francisca-arenales', {
      sessionToken: 'test-session-francisca',
      formattedAddress: 'La Fransisca, Arenales, Salta',
      title: 'La Fransisca',
      subtitle: 'Arenales, Salta',
    });

    expect(details.formattedAddress).toContain('La Fransisca');
    expect(details.lat).toBeCloseTo(-24.7704, 3);
    expect(details.lng).toBeCloseTo(-65.4211, 3);

    const tomtomCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('api.tomtom.com'));
    expect(tomtomCalls.length).toBe(0);
  });

  it('para hiper libertad geocodifica sucursales vía Place Details Essentials', async () => {
    const balcon = await getPlaceDetails('google:google-el-balcon-paseo', {
      sessionToken: 'test-session-hiper-libertad',
      formattedAddress: 'El Balcón - Paseo Libertad Salta, Avenida Ex Combatientes de Malvinas, Salta',
      title: 'El Balcón - Paseo Libertad Salta',
      subtitle: 'Avenida Ex Combatientes de Malvinas, Salta',
    });

    expect(balcon.formattedAddress).toContain('El Balcón');
    expect(balcon.lat).toBeCloseTo(-24.8321, 3);
    expect(balcon.lng).toBeCloseTo(-65.4276, 3);

    const hiper = await getPlaceDetails('google:google-hiper-libertad-paseo', {
      sessionToken: 'test-session-hiper-libertad-2',
      formattedAddress: 'Hiper Libertad - Libertad SA, Batalla de Suipacha, Salta',
      title: 'Hiper Libertad - Libertad SA',
      subtitle: 'Batalla de Suipacha, Salta',
    });

    expect(hiper.formattedAddress).toContain('Hiper Libertad');
    expect(hiper.lat).toBeCloseTo(-24.8321, 3);
    expect(hiper.lng).toBeCloseTo(-65.4276, 3);

    const anonima = await getPlaceDetails('google:google-la-anonima-paseo', {
      sessionToken: 'test-session-la-anonima',
      formattedAddress: 'La Anónima, Scalabrini Ortiz Norte, Salta',
      title: 'La Anónima',
      subtitle: 'Scalabrini Ortiz Norte, Salta',
    });

    expect(anonima.formattedAddress).toContain('La Anónima');
    expect(anonima.lat).toBeCloseTo(-24.8321, 3);
    expect(anonima.lng).toBeCloseTo(-65.4276, 3);

    const tomtomCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('api.tomtom.com'));
    expect(tomtomCalls.length).toBe(0);
  });

  it('para axion y ypf geocodifica sucursales vía Place Details Essentials', async () => {
    const axionRural = await getPlaceDetails('google:google-axion-rural', {
      sessionToken: 'test-session-axion',
      formattedAddress: 'AXION energy - Octano Srl (La Rural), Avenida Paraguay, Salta',
      title: 'AXION energy - Octano Srl (La Rural)',
      subtitle: 'Avenida Paraguay, Salta',
    });

    expect(axionRural.formattedAddress).toContain('AXION energy');
    expect(axionRural.lat).toBeCloseTo(-24.8130, 3);
    expect(axionRural.lng).toBeCloseTo(-65.4235, 3);

    const axionPaseo = await getPlaceDetails('google:google-axion-paseo', {
      sessionToken: 'test-session-axion-2',
      formattedAddress: 'AXION energy - DEL PASEO, Avenida Ex Combatientes de Malvinas, Salta',
      title: 'AXION energy - DEL PASEO',
      subtitle: 'Avenida Ex Combatientes de Malvinas, Salta',
    });

    expect(axionPaseo.lat).toBeCloseTo(-24.8304, 3);
    expect(axionPaseo.lng).toBeCloseTo(-65.4309, 3);

    const ypf = await getPlaceDetails('google:google-ypf-entre-rios', {
      sessionToken: 'test-session-ypf',
      formattedAddress: 'YPF, Avenida Entre Ríos, Salta',
      title: 'YPF',
      subtitle: 'Avenida Entre Ríos, Salta',
    });

    expect(ypf.lat).toBeCloseTo(-24.7797, 3);
    expect(ypf.lng).toBeCloseTo(-65.4292, 3);
  });

  it('para intersección Juan Galvez y Domingo Marimon geocodifica vía Place Details Essentials', async () => {
    const details = await getPlaceDetails('google:google-intersection-galvez-marimon', {
      sessionToken: 'test-session-intersection',
      formattedAddress: 'Juan Galvez y Domingo Marimon, Salta',
      title: 'Juan Galvez y Domingo Marimon',
      subtitle: 'Salta',
    });

    expect(details.formattedAddress).toContain('Juan Galvez y Domingo Marimon');
    expect(details.lat).toBeCloseTo(-24.7954, 3);
    expect(details.lng).toBeCloseTo(-65.3774, 3);
  });

  it('geocodifica Escuela de Emprendedores vía Place Details Essentials', async () => {
    const details = await getPlaceDetails('google:google-escuela-emprendedores', {
      sessionToken: 'test-session-emprendedores',
      formattedAddress: 'Escuela de Emprendedores Salta, Avenida Independencia, Salta',
      title: 'Escuela de Emprendedores Salta',
      subtitle: 'Avenida Independencia, Salta',
    });

    expect(details.formattedAddress).toContain('Emprendedores');
    expect(details.lat).toBeCloseTo(-24.7985777, 3);
    expect(details.lng).toBeCloseTo(-65.4162771, 3);
    expect(details.lat).not.toBeCloseTo(-24.82919, 2);

    const nominatimCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('nominatim'));
    expect(nominatimCalls.length).toBe(0);
  });

  it('geocodifica Escuela Normal de Maestras vía Place Details Essentials', async () => {
    const details = await getPlaceDetails('google:ChIJXeY5zbjDG5QRsstuzg8yVow', {
      sessionToken: 'test-session-escuela-normal',
      formattedAddress: 'Escuela Normal de Maestras General Manuel Belgrano, Bartolomé Mitre, Salta',
      title: 'Escuela Normal de Maestras General Manuel Belgrano',
      subtitle: 'Bartolomé Mitre, Salta',
    });

    expect(details.formattedAddress).toContain('Escuela Normal');
    expect(details.lat).toBeCloseTo(-24.78048, 3);
    expect(details.lng).toBeCloseTo(-65.410809, 3);
  });

  it('geocodifica Espacio INCAA Hogar Escuela vía Place Details Essentials', async () => {
    const details = await getPlaceDetails('google:ChIJU-J5iy7DG5QRces48wzsYl8', {
      sessionToken: 'test-session-incaa-hogar',
      formattedAddress: 'Espacio INCAA Hogar Escuela, Avenida Hipólito Yrigoyen, Salta',
      title: 'Espacio INCAA Hogar Escuela',
      subtitle: 'Avenida Hipólito Yrigoyen, Salta',
    });

    expect(details.formattedAddress).toContain('INCAA');
    expect(details.lat).toBeCloseTo(-24.7965187, 3);
    expect(details.lng).toBeCloseTo(-65.4006911, 3);
  });

  it('devuelve direcciones con altura vía Nominatim/GeoRef', async () => {
    const entreRios = await geocodeAddress('Entre Rios 200');
    expect(entreRios.lat).toBeDefined();
    expect(entreRios.lng).toBeDefined();
    expect(/entre r[ií]os/i.test(entreRios.formattedAddress)).toBe(true);

    const bolivia = await geocodeAddress('Bolivia 200');
    expect(bolivia.lat).toBeDefined();
    expect(bolivia.lng).toBeDefined();
    expect(/bolivia/i.test(bolivia.formattedAddress)).toBe(true);
  });
});
