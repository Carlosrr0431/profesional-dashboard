const { cachedPoiMatches, interpretPlacesConsume, placesBillingPeriod, PLACES_MONTHLY_CALL_LIMIT } = require('../../shared/geo/placesBudget');
const { autocompleteAddressSalta, setPlacesBudget } = require('../../shared/geo/googlePlaces');

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
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: [suggestion] }),
    }));

    const first = await autocompleteAddressSalta('farmacia', 5);
    const second = await autocompleteAddressSalta('farmacia', 5);

    expect(first[0].title).toBe('Farmacia del Centro');
    expect(first[0].placeId).toBe('google:abc123');
    expect(second[0].placeId).toBe('google:abc123');
    expect(calls).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(saved.size).toBe(1);
    expect([...saved.values()][0][0].placeId).toBe('google:abc123');
  });

  it('si el lugar ya está guardado no llama a Google', async () => {
    setPlacesBudget({
      tryConsume: async () => {
        throw new Error('no debería gastar una llamada');
      },
      getSearch: async () => null,
      findPlaces: async () => [{
        placeId: 'google:cached',
        title: 'Farmacia del Centro',
        subtitle: 'Caseros 100, Salta',
        address: 'Farmacia del Centro, Caseros 100, Salta',
      }],
      saveSearch: async () => {},
    });
    global.fetch = jest.fn();
    const results = await autocompleteAddressSalta('botica del centro', 5);
    expect(results[0].placeId).toBe('google:cached');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('en el tope no llama a Google', async () => {
    setPlacesBudget({
      tryConsume: async () => false,
      getSearch: async () => null,
      saveSearch: async () => {},
    });
    global.fetch = jest.fn();
    const results = await autocompleteAddressSalta('farmacia del centro', 5);
    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
