jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn(() => {
    throw new Error('supabase no usado en lookup_address');
  }),
}));

jest.mock('../../shared/geo/osrm.js', () => ({
  getRouteMetricsByAddress: jest.fn(),
}));

const { getRouteMetricsByAddress } = require('../../shared/geo/osrm.js');
const { lookupAddress, resolveLookupAddress, runTripIntentTool } = require('../../src/lib/tripIntentTools');
const { pickTripIntentReasoningEffort } = require('../../src/lib/tripIntentSystemPrompt');
const { TRIP_INTENT_TOOLS, TRIP_INTENT_JSON_SCHEMA } = require('../../src/lib/tripIntentSchema');
const {
  toolsForChatCompletions,
  buildResponsesTextFormat,
  normalizeReasoningEffort,
} = require('../../src/lib/deepseekClient');

describe('lookup_address (remis)', () => {
  it('resuelve calle y altura de catálogo', () => {
    const result = lookupAddress('mitre 200');
    expect(result.found).toBe(true);
    expect(result.kind).toBe('street');
    expect(result.canonical).toMatch(/mitre 200/i);
    expect(result.needs_number).toBe(false);
  });

  it('no inventa calle a partir de "tienen"', () => {
    expect(lookupAddress('tienen').found).toBe(false);
    expect(lookupAddress('tienen movil').found).toBe(false);
  });

  it('deja Güemes ambiguo para el poll', () => {
    const result = lookupAddress('guemes 300');
    expect(result.found).toBe(true);
    expect(result.homonym).toBe('guemes');
    expect(result.ambiguous).toBe(true);
    expect(result.canonical).toMatch(/^Güemes 300/i);
    expect(result.canonical).not.toMatch(/general|mart[ií]n|adolfo/i);
  });

  it('toma calle y altura aunque el POI Balcarce coincida', () => {
    const result = lookupAddress('Balcarce 1478');
    expect(result.found).toBe(true);
    expect(result.kind).toBe('street');
    expect(result.canonical).toMatch(/balcarce 1478/i);
    expect(result.canonical).not.toMatch(/paseo/i);
  });

  it('toma barrio tres cerritos y no el hospital', () => {
    const result = lookupAddress('barrio tres cerritos');
    expect(result.found).toBe(true);
    expect(result.kind).toBe('barrio');
    expect(result.canonical).toMatch(/tres cerritos/i);
    expect(result.canonical).not.toMatch(/hospital/i);
  });

  it('resuelve POI terminal sin inventar dirección', () => {
    const result = lookupAddress('la terminal');
    expect(result.found).toBe(true);
    expect(result.kind).toBe('poi');
    expect(result.canonical).toMatch(/terminal/i);
    expect(result.needs_number).toBe(false);
  });

  it('no trata "Flavio Mendoza" de un show como calle', () => {
    const result = lookupAddress(
      'Hola! te pido un remis para las 19:45 para la hab 105. Ellos se van al show de flavio mendoza.',
    );
    expect(result.found).toBe(false);
    expect(result.canonical || '').not.toMatch(/mendoza/i);
  });

  it('sigue resolviendo Calle Mendoza cuando es dirección', () => {
    const result = lookupAddress('Mendoza 200');
    expect(result.found).toBe(true);
    expect(result.kind).toBe('street');
    expect(result.canonical).toMatch(/mendoza 200/i);
  });

  it('pide GPS si dice acá', () => {
    const result = lookupAddress('aca');
    expect(result.found).toBe(false);
    expect(result.needs_gps).toBe(true);
  });
});

describe('lookup_address + Google Places New', () => {
  it('no mete Monoblock en el catálogo local', () => {
    const catalog = lookupAddress('monoblok salta sobre sarmiento');
    expect(catalog.kind).not.toBe('poi');
    expect(catalog.kind === 'street' || catalog.found === false).toBe(true);
  });

  it('elige la sede de Sarmiento si el pasajero la nombra', async () => {
    const result = await resolveLookupAddress(
      'buenas me puede mandar un movil al monoblok salta? sobre sarmiento?',
    );
    expect(result.found).toBe(true);
    expect(result.kind).toBe('google_place');
    expect(result.ambiguous).toBe(false);
    expect(result.canonical).toMatch(/sarmiento/i);
    expect(result.canonical).not.toMatch(/25 de mayo/i);
    expect(result.options.some((item) => /sarmiento/i.test(item.subtitle))).toBe(true);
    expect(result.options.some((item) => /25 de mayo/i.test(item.subtitle))).toBe(true);
    expect(result.options.every((item) => !/jujuy/i.test(item.subtitle))).toBe(true);
  });

  it('deja ambiguous para poll si no hay calle', async () => {
    const result = await resolveLookupAddress('monoblock salta');
    expect(result.found).toBe(true);
    expect(result.kind).toBe('google_place');
    expect(result.ambiguous).toBe(true);
    expect(result.canonical).toMatch(/monoblock/i);
    expect(result.options.length).toBeGreaterThan(1);
  });

  it('usa Places Autocomplete New desde la tool', async () => {
    const result = await runTripIntentTool('lookup_address', {
      query: 'monoblok salta sobre sarmiento',
    });
    expect(result.kind).toBe('google_place');
    expect(result.canonical).toMatch(/sarmiento/i);

    const googleCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('googleapis.com'));
    expect(googleCalls.some(([url]) => String(url).includes('places:autocomplete'))).toBe(true);
    expect(googleCalls.every(([url]) => !/textsearch|findplacefromtext|searchText|searchNearby/i.test(String(url)))).toBe(true);
    expect(googleCalls.every(([url]) => !String(url).includes('maps.googleapis.com/maps/api/geocode'))).toBe(true);
  });
});

describe('quote_fare', () => {
  beforeEach(() => {
    getRouteMetricsByAddress.mockReset();
  });

  it('no inventa precio si falta destino', async () => {
    const result = await runTripIntentTool('quote_fare', { origin: 'Mitre 200, Salta' }, { settings: {} });
    expect(result.priced).toBe(false);
    expect(getRouteMetricsByAddress).not.toHaveBeenCalled();
  });

  it('usa km y tarifa reales', async () => {
    getRouteMetricsByAddress.mockResolvedValue({
      distanceKm: 4,
      durationMinutes: 12,
      originResolved: 'Mitre 200, Salta',
      destinationResolved: 'Güemes 400, Salta',
    });
    const result = await runTripIntentTool(
      'quote_fare',
      { origin: 'Mitre 200, Salta', destination: 'Güemes 400, Salta' },
      { settings: { platform_tariff_base: 500, platform_tariff_per_km: 150 } },
    );
    expect(result.priced).toBe(true);
    expect(result.distance_km).toBe(4);
    expect(result.price).toBe(1100);
  });
});

describe('trip intent tools + schema', () => {
  it('expone las 4 tools de remis, no catálogo ni stock', () => {
    const names = TRIP_INTENT_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(['lookup_address', 'quote_fare', 'get_service_status', 'get_trip_status']);
    expect(names).not.toEqual(expect.arrayContaining(['lookup_catalog', 'check_stock']));
  });

  it('arma json_schema estricto y tools de Chat Completions', () => {
    const format = buildResponsesTextFormat(TRIP_INTENT_JSON_SCHEMA);
    expect(format.format.type).toBe('json_schema');
    expect(format.format.name).toBe('trip_intent');
    expect(format.format.schema.required).toContain('pickup_location');
    const chatTools = toolsForChatCompletions(TRIP_INTENT_TOOLS);
    expect(chatTools[0].function.name).toBe('lookup_address');
  });
});

describe('pickTripIntentReasoningEffort', () => {
  it('deja thinking apagado en un pedido simple', () => {
    expect(pickTripIntentReasoningEffort({ text: 'mandame un movil a mitre 200' })).toBe('none');
    expect(normalizeReasoningEffort('none')).toBe('none');
  });

  it('sube a low si Güemes es ambiguo o hay dos tramos', () => {
    expect(pickTripIntentReasoningEffort({ text: 'remis a guemes 300' })).toBe('low');
    expect(pickTripIntentReasoningEffort({
      text: 'mitre 200 es para ir hasta belgrano 100',
    })).toBe('low');
    expect(pickTripIntentReasoningEffort({
      text: '200',
      context: { awaiting_pickup_number: true },
    })).toBe('low');
  });

  it('sube a low en un pedido de móvil sin altura', () => {
    expect(pickTripIntentReasoningEffort({
      text: 'mandame un movil al monoblok salta sobre sarmiento',
    })).toBe('low');
  });
});
