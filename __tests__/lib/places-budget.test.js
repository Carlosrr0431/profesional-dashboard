const { cachedPoiMatches, interpretPlacesConsume, placesBillingPeriod, PLACES_MONTHLY_CALL_LIMIT } = require('../../shared/geo/placesBudget');
const { autocompleteAddressSalta, mergeGoogleFirst, setPlacesBudget } = require('../../shared/geo/googlePlaces');

describe('contador de Places', () => {
  it('corta en 9000 y deja pasar la llamada que llega justo a ese número', () => {
    expect(PLACES_MONTHLY_CALL_LIMIT).toBe(9000);
    expect(interpretPlacesConsume(9000)).toEqual({ allowed: true, count: 9000 });
    expect(interpretPlacesConsume(8999).allowed).toBe(true);
    expect(interpretPlacesConsume(null)).toEqual({ allowed: false, count: null });
    expect(placesBillingPeriod(new Date('2026-10-26T21:00:00.000Z'))).toBe('2026-10');
  });

  it('un lugar guardado coincide aunque la búsqueda no sea idéntica', () => {
    expect(cachedPoiMatches('Farmacia del Centro Caseros 100 Salta', 'farmacia centro')).toBe(true);
    expect(cachedPoiMatches('Hospital San Bernardo', 'alvarado 241')).toBe(false);
    expect(cachedPoiMatches('C. Fragata Sarmiento 292, Salta', 'avenida sarmiento 292')).toBe(false);
    expect(cachedPoiMatches('Av. Sarmiento 292, A4400 Salta', 'avenida sarmiento 292')).toBe(true);
    expect(cachedPoiMatches('Maipú 48, A4400 Salta', 'maipu 48')).toBe(true);
    expect(cachedPoiMatches('Maipú 49 2, A4400 Salta', 'maipu 48')).toBe(false);
    expect(cachedPoiMatches('Maipú 480, Salta', 'maipu 48')).toBe(false);
    expect(cachedPoiMatches('Barrio Río Ancho, Casa 2, Gomería', 'barrio san jose')).toBe(false);
    expect(cachedPoiMatches('Centro Vecinal Barrio San José, Salta', 'barrio san jose')).toBe(true);
  });
});

describe('búsqueda de Places con cupo y caché', () => {
  const suggestion = {
    placePrediction: {
      placeId: 'abc123',
      types: ['establishment'],
      structuredFormat: {
        mainText: { text: 'Farmacia del Centro' },
        secondaryText: { text: 'Caseros 100, Salta' },
      },
    },
  };

  afterEach(() => {
    setPlacesBudget(null);
  });

  it('sin contador no llama a Google', async () => {
    global.fetch = jest.fn();
    const results = await autocompleteAddressSalta('farmacia', 5);
    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('la primera búsqueda cuenta una llamada, guarda la búsqueda y cada lugar, y la segunda sale de la caché', async () => {
    const saved = new Map();
    let calls = 0;
    setPlacesBudget({
      tryConsume: async () => {
        calls += 1;
        return calls <= 9000;
      },
      getSearch: async (key) => saved.get(key) || null,
      saveSearch: async (key, suggestions) => {
        saved.set(key, suggestions);
      },
    });
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('places:autocomplete')) {
        return { ok: true, json: async () => ({ suggestions: [suggestion] }) };
      }
      return {
        ok: true,
        json: async () => ({
          id: 'abc123',
          formattedAddress: 'Caseros 100, Salta',
          location: { latitude: -24.7891, longitude: -65.4102 },
          types: ['pharmacy'],
        }),
      };
    });

    const first = await autocompleteAddressSalta('farmacia', 5);
    const second = await autocompleteAddressSalta('farmacia', 5);

    expect(first[0].title).toBe('Farmacia del Centro');
    expect(first[0].placeId).toBe('google:abc123');
    expect(second[0].placeId).toBe('google:abc123');
    expect(calls).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(saved.size).toBe(1);
    const stored = [...saved.values()][0][0];
    expect(stored.placeId).toBe('google:abc123');
    expect(String(global.fetch.mock.calls[0][1].headers['X-Goog-FieldMask'])).not.toContain('distanceMeters');
  });

  it('un solo lugar guardado no alcanza: se piden los que faltan y quedan en la búsqueda', async () => {
    const saved = new Map();
    setPlacesBudget({
      tryConsume: async () => true,
      getSearch: async (key) => saved.get(key) || null,
      findPlaces: async () => [{
        placeId: 'google:cached',
        title: 'Farmacia del Centro',
        subtitle: 'Caseros 100, Salta',
        address: 'Farmacia del Centro, Caseros 100, Salta',
      }],
      saveSearch: async (key, suggestions) => {
        saved.set(key, suggestions);
      },
    });
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('places:autocomplete')) {
        return {
          ok: true,
          json: async () => ({
            suggestions: [
              suggestion,
              {
                placePrediction: {
                  placeId: 'domingo',
                  types: ['route'],
                  structuredFormat: {
                    mainText: { text: 'Doctor Domingo Güemes 150' },
                    secondaryText: { text: 'Salta' },
                  },
                },
              },
            ],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    const first = await autocompleteAddressSalta('caseros 100', 5);
    const second = await autocompleteAddressSalta('caseros 100', 5);
    expect(first.map((item) => item.placeId)).toEqual(['google:abc123', 'google:domingo']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(second[1].placeId).toBe('google:domingo');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.locationRestriction.rectangle.low.latitude).toBeCloseTo(-24.9, 1);
    expect(body.locationBias).toBeUndefined();
  });

  it('una altura ya guardada con coordenadas no vuelve a llamar a Google', async () => {
    setPlacesBudget({
      tryConsume: async () => true,
      getSearch: async () => null,
      findPlaces: async () => [{
        placeId: 'google:caseros-2545',
        title: 'Caseros 2545',
        subtitle: 'Salta',
        formattedAddress: 'Caseros 2545, A4400 Salta',
        lat: -24.7880819,
        lng: -65.4376924,
      }],
      saveSearch: async () => {},
    });
    global.fetch = jest.fn();
    const results = await autocompleteAddressSalta('Caseros 2545', 5);
    expect(results[0].lat).toBeCloseTo(-24.7880819, 6);
    expect(results[0].lng).toBeCloseTo(-65.4376924, 6);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('la lista de Google queda adelante y no se repite', () => {
    const merged = mergeGoogleFirst([
      { placeId: 'google:martin', title: 'General Martin Güemes 150' },
      { placeId: 'google:domingo', title: 'Doctor Domingo Güemes 150' },
      { placeId: 'google:vaqueros', title: 'Avenida General Güemes 150', subtitle: 'Vaqueros, Salta' },
    ], [
      { placeId: 'georef:1', title: 'General Güemes 150', subtitle: 'Rosario de Lerma, Salta' },
      { placeId: 'google:martin', title: 'General Martin Güemes 150' },
    ], 5);
    expect(merged.map((item) => item.placeId)).toEqual([
      'google:martin',
      'google:domingo',
      'google:vaqueros',
      'georef:1',
    ]);
  });

  it('un contador que rechaza no frena la búsqueda', async () => {
    setPlacesBudget({
      tryConsume: async () => false,
      getSearch: async () => null,
      saveSearch: async () => {},
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: [suggestion] }),
    }));
    const results = await autocompleteAddressSalta('farmacia del centro', 5);
    expect(results[0].placeId).toBe('google:abc123');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('una calle ya guardada no vuelve a pedir la ampliación a Google', async () => {
    const saved = new Map();
    const seed = [{
      placeId: 'google:alvear-short',
      title: 'Alvear 700',
      subtitle: 'Salta',
    }];
    setPlacesBudget({
      tryConsume: async () => true,
      getSearch: async (key) => (saved.has(key) ? saved.get(key) : seed),
      saveSearch: async (key, suggestions) => {
        saved.set(key, suggestions);
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: [] }),
    }));

    const first = await autocompleteAddressSalta('alvear 700', 5);
    expect(first.some((item) => item._expanded)).toBe(false);
    expect(first[0].placeId).toBe('google:alvear-short');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const now = Date.now;
    Date.now = () => now() + 120000;
    try {
      const second = await autocompleteAddressSalta('alvear 700', 5);
      expect(second[0].placeId).toBe('google:alvear-short');
      expect(second.some((item) => item._expanded)).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      Date.now = now;
    }
  });

  it('una escuela o un shopping ya guardados no vuelven a llamar a Google', async () => {
    setPlacesBudget({
      tryConsume: async () => true,
      getSearch: async () => null,
      findPlaces: async () => [{
        placeId: 'google:alto-noa',
        title: 'Alto NOA Shopping',
        subtitle: 'Avenida Bicentenario, Salta',
        formattedAddress: 'Alto NOA Shopping, Avenida Bicentenario, Salta',
        lat: -24.782,
        lng: -65.412,
      }],
      saveSearch: async () => {},
    });
    global.fetch = jest.fn();
    const results = await autocompleteAddressSalta('alto noa', 5);
    expect(results[0].placeId).toBe('google:alto-noa');
    expect(results[0].lat).toBeCloseTo(-24.782, 3);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('la palabra escuela sola sigue buscando en Google', async () => {
    setPlacesBudget({
      tryConsume: async () => true,
      getSearch: async () => null,
      findPlaces: async () => [{
        placeId: 'google:normal',
        title: 'Escuela Normal',
        subtitle: 'Salta',
        formattedAddress: 'Escuela Normal, Salta',
        lat: -24.78,
        lng: -65.41,
      }],
      saveSearch: async () => {},
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: [suggestion] }),
    }));
    await autocompleteAddressSalta('escuela', 5);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('completa el punto guardado del lugar y no vuelve a llamar a Google', async () => {
    const stored = [{
      placeId: 'google:penal2',
      title: 'Sitio de Memoria Unidad Penal de Villa Las Rosas',
      subtitle: 'Avenida Hipólito Yrigoyen, Salta',
    }];
    setPlacesBudget({
      tryConsume: async () => false,
      getSearch: async (key) => (String(key).includes('unidadpenal') ? stored : null),
      saveSearch: async (_key, suggestions) => {
        stored.splice(0, stored.length, ...suggestions);
      },
      lookupPlace: async (placeId) => (placeId === 'google:penal2' ? {
        placeId,
        lat: -24.82,
        lng: -65.41,
        formattedAddress: 'Av. Hipólito Yrigoyen, Salta',
        title: 'Sitio de Memoria Unidad Penal de Villa Las Rosas',
      } : null),
    });
    global.fetch = jest.fn();
    const results = await autocompleteAddressSalta('unidadpenal', 5);
    expect(results[0].lat).toBeCloseTo(-24.82, 2);
    expect(results[0].lng).toBeCloseTo(-65.41, 2);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(stored[0].lat).toBeCloseTo(-24.82, 2);
  });
});
