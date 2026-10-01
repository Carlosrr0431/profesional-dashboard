const { autocompleteAddressSalta } = require('../../shared/geo/nominatim');

const POI_TYPES = ['store', 'ice_cream_shop', 'establishment', 'point_of_interest'];
const GOOGLE_MAX = 5;

function makePlace(id, lat, lng, street, types = POI_TYPES) {
  return { id, lat, lng, street, types, title: 'Grido helado' };
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function toPrediction(place, origin) {
  return {
    placePrediction: {
      ...(origin
        ? { distanceMeters: Math.round(haversineMeters(origin.latitude, origin.longitude, place.lat, place.lng)) }
        : {}),
      placeId: place.id,
      text: { text: `${place.title}, ${place.street}` },
      structuredFormat: {
        mainText: { text: place.title },
        secondaryText: { text: `${place.street}, Salta, Capital, Salta, Argentina` },
      },
      types: place.types,
    },
  };
}

/** Google simulado: respeta locationRestriction y corta en 5 sugerencias por request. */
function installGoogleMock(places) {
  global.fetch = jest.fn(async (url, options) => {
    if (!String(url).includes('places.googleapis.com/v1/places:autocomplete')) {
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    }
    const body = JSON.parse(options.body);
    const { low, high } = body.locationRestriction.rectangle;
    const inside = places.filter((p) => (
      p.lat >= low.latitude && p.lat <= high.latitude
      && p.lng >= low.longitude && p.lng <= high.longitude
    ));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: inside.slice(0, GOOGLE_MAX).map((place) => toPrediction(place, body.origin)),
      }),
    };
  });
  return global.fetch;
}

// El autocomplete cachea 45 s por texto: cada test usa una consulta distinta. Son prefijos del
// nombre "Grido helado", así que siguen coincidiendo por nombre con los lugares simulados.
const QUERIES = [
  'gri', 'grid', 'grido', 'grido he', 'grido hel', 'grido hela', 'grido helad', 'grido helado',
  'helado', 'helad', 'hela', 'hel', 'rido', 'ido',
];
let queryIndex = 0;
const nextQuery = () => QUERIES[queryIndex++];

const autocompleteCalls = () => global.fetch.mock.calls.filter(([url]) => (
  String(url).includes('places:autocomplete')
));

// Grilla de 20 sucursales repartidas por Salta Capital (cada cuadrante tiene ~5).
function spreadPlaces() {
  return Array.from({ length: 20 }, (_, i) => makePlace(
    `p${i}`,
    -24.88 + (i % 5) * 0.04,
    -65.53 + Math.floor(i / 5) * 0.06,
    `Calle ${i}`,
  ));
}

describe('autocomplete ampliado por zonas (expand)', () => {
  it('sin expand devuelve solo lo que entrega Google en un request (máx. 5)', async () => {
    installGoogleMock(spreadPlaces());
    const results = await autocompleteAddressSalta(nextQuery(), 8, { sessionToken: 's-1' });
    expect(autocompleteCalls()).toHaveLength(1);
    expect(results.length).toBeLessThanOrEqual(GOOGLE_MAX);
  });

  it('con expand explora por zonas y devuelve todas las sucursales', async () => {
    installGoogleMock(spreadPlaces());
    const results = await autocompleteAddressSalta(nextQuery(), 60, { sessionToken: 's-2', expand: true });

    const ids = results.map((item) => item.placeId).sort();
    const expected = spreadPlaces().map((p) => `google:${p.id}`).sort();
    expect(ids).toEqual(expected);
    expect(autocompleteCalls().length).toBeGreaterThan(1);
  });

  it('subdivide una zona saturada hasta separar las sucursales del centro', async () => {
    // 5 sucursales muy juntas + 1 en el mismo cuadrante (NE) pero lejos: el cuadrante vuelve a
    // llenarse con las 5 juntas y hace falta subdividirlo para ver la sexta.
    const places = [
      ...Array.from({ length: 5 }, (_, i) => makePlace(`c${i}`, -24.7900 - i * 0.0005, -65.4100, `Centro ${i}`)),
      makePlace('far', -24.7200, -65.3100, 'Avenida José Contrera'),
    ];
    installGoogleMock(places);

    const query = nextQuery();
    const withoutExpand = await autocompleteAddressSalta(query, 60, { sessionToken: 's-3' });
    expect(withoutExpand.some((item) => item.placeId === 'google:far')).toBe(false);

    const results = await autocompleteAddressSalta(query, 60, { sessionToken: 's-3b', expand: true });
    expect(results.some((item) => item.placeId === 'google:far')).toBe(true);
    expect(results).toHaveLength(6);
  });

  it('no descarta sucursales con el mismo rótulo (misma avenida)', async () => {
    installGoogleMock([
      makePlace('dup-a', -24.80, -65.45, 'Avenida Entre Ríos'),
      makePlace('dup-b', -24.84, -65.35, 'Avenida Entre Ríos'),
      ...Array.from({ length: 4 }, (_, i) => makePlace(`x${i}`, -24.72 + i * 0.01, -65.52, `Otra ${i}`)),
    ]);
    const results = await autocompleteAddressSalta(nextQuery(), 60, { sessionToken: 's-4', expand: true });
    const sameStreet = results.filter((item) => /entre r[ií]os/i.test(item.subtitle || ''));
    expect(sameStreet.map((item) => item.placeId).sort()).toEqual(['google:dup-a', 'google:dup-b']);
  });

  it('usa el mismo sessionToken y solo Autocomplete (sin Text Search ni Nearby)', async () => {
    installGoogleMock(spreadPlaces());
    await autocompleteAddressSalta(nextQuery(), 60, { sessionToken: 'sesion-unica', expand: true });

    const calls = autocompleteCalls();
    const tokens = new Set(calls.map(([, options]) => JSON.parse(options.body).sessionToken));
    expect(tokens).toEqual(new Set(['sesion-unica']));
    global.fetch.mock.calls.forEach(([url]) => {
      expect(String(url)).toMatch(/places\.googleapis\.com\/v1\/places:autocomplete$/);
    });
  });

  it('acota el costo: nunca más de 40 requests por búsqueda', async () => {
    // 200 sucursales distribuidas de forma pareja: todas las zonas se saturan.
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const places = Array.from({ length: 200 }, (_, i) => makePlace(
      `u${i}`,
      -24.90 + rand() * 0.2,
      -65.55 + rand() * 0.25,
      `Calle ${i}`,
    ));
    installGoogleMock(places);

    const results = await autocompleteAddressSalta(nextQuery(), 60, { sessionToken: 's-6', expand: true });
    expect(autocompleteCalls().length).toBe(40);
    expect(results.length).toBeGreaterThan(8);
    expect(results.length).toBeLessThanOrEqual(60);
  });

  it('no expande si Google devuelve menos de 5 (ya está todo)', async () => {
    installGoogleMock(spreadPlaces().slice(0, 3));
    const results = await autocompleteAddressSalta(nextQuery(), 60, { sessionToken: 's-7', expand: true });
    expect(autocompleteCalls()).toHaveLength(1);
    expect(results).toHaveLength(3);
  });

  it('no expande búsquedas de calles', async () => {
    installGoogleMock(Array.from({ length: 8 }, (_, i) => (
      makePlace(`r${i}`, -24.80 + i * 0.01, -65.42, `Tramo ${i}`, ['route', 'geocode'])
    )));
    await autocompleteAddressSalta('belgrano', 60, { sessionToken: 's-8', expand: true });
    expect(autocompleteCalls()).toHaveLength(1);
  });

  it('no expande si los comercios aparecen por su dirección y no por su nombre', async () => {
    // "moreno": Google devuelve comercios ubicados sobre esa calle, ninguno se llama Moreno.
    installGoogleMock(spreadPlaces());
    await autocompleteAddressSalta('moreno', 60, { sessionToken: 's-8b', expand: true });
    expect(autocompleteCalls()).toHaveLength(1);
  });

  it('no expande calle con altura aunque Google devuelva comercios', async () => {
    installGoogleMock(spreadPlaces());
    await autocompleteAddressSalta('belgrano 123', 60, { sessionToken: 's-9', expand: true });
    expect(autocompleteCalls()).toHaveLength(1);
  });

  it('no expande consultas muy cortas', async () => {
    installGoogleMock(spreadPlaces());
    await autocompleteAddressSalta('gr', 60, { sessionToken: 's-10', expand: true });
    expect(autocompleteCalls()).toHaveLength(1);
  });

  describe('orden por cercanía (near)', () => {
    const NEAR_CENTER = { latitude: -24.79, longitude: -65.41 };
    const NEAR_SOUTH_WEST = { latitude: -24.88, longitude: -65.53 };

    it('ordena de la sucursal más cercana a la más lejana y expone la distancia', async () => {
      installGoogleMock(spreadPlaces());
      const results = await autocompleteAddressSalta(nextQuery(), 60, {
        sessionToken: 'n-1', expand: true, near: NEAR_CENTER,
      });

      expect(results).toHaveLength(20);
      const distances = results.map((item) => item.distanceMeters);
      expect(distances.every(Number.isFinite)).toBe(true);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      expect(results.every((item) => !('byDistance' in item))).toBe(true);
    });

    it('manda el mismo origin en todos los requests (raíz y zonas)', async () => {
      installGoogleMock(spreadPlaces());
      await autocompleteAddressSalta(nextQuery(), 60, { sessionToken: 'n-2', expand: true, near: NEAR_CENTER });

      const origins = autocompleteCalls().map(([, options]) => JSON.parse(options.body).origin);
      expect(origins.length).toBeGreaterThan(1);
      origins.forEach((origin) => expect(origin).toEqual(NEAR_CENTER));
    });

    it('cambia el orden según desde dónde se busca (no reusa caché de otra ubicación)', async () => {
      installGoogleMock(spreadPlaces());
      const query = nextQuery();
      const fromCenter = await autocompleteAddressSalta(query, 60, { sessionToken: 'n-3', expand: true, near: NEAR_CENTER });
      const fromSouthWest = await autocompleteAddressSalta(query, 60, { sessionToken: 'n-3b', expand: true, near: NEAR_SOUTH_WEST });

      expect(fromSouthWest[0].placeId).not.toBe(fromCenter[0].placeId);
      // la más cercana al extremo sudoeste es la del primer punto de la grilla (p0)
      expect(fromSouthWest[0].placeId).toBe('google:p0');
    });

    it('sin ubicación no agrega distancia ni cambia el formato de los resultados', async () => {
      installGoogleMock(spreadPlaces());
      const results = await autocompleteAddressSalta(nextQuery(), 60, { sessionToken: 'n-4', expand: true });

      expect(results).toHaveLength(20);
      expect(results.every((item) => !('distanceMeters' in item))).toBe(true);
    });

    it('ignora una ubicación fuera de Salta Capital', async () => {
      installGoogleMock(spreadPlaces());
      const results = await autocompleteAddressSalta(nextQuery(), 60, {
        sessionToken: 'n-5', expand: true, near: { latitude: -34.6, longitude: -58.4 },
      });

      autocompleteCalls().forEach(([, options]) => {
        expect(JSON.parse(options.body).origin?.latitude).not.toBe(-34.6);
      });
      expect(results.every((item) => !('distanceMeters' in item))).toBe(true);
    });

    it('no reordena por cercanía cuando no hubo expansión (calles conservan su orden)', async () => {
      installGoogleMock(Array.from({ length: 3 }, (_, i) => (
        makePlace(`s${i}`, -24.80 + i * 0.03, -65.42, `Tramo ${i}`, ['route', 'geocode'])
      )));
      const results = await autocompleteAddressSalta('san martin', 60, {
        sessionToken: 'n-6', expand: true, near: NEAR_SOUTH_WEST,
      });

      expect(autocompleteCalls()).toHaveLength(1);
      expect(results.every((item) => !('distanceMeters' in item))).toBe(true);
    });
  });
});
