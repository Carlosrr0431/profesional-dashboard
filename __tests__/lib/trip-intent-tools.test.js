jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn(() => {
    throw new Error('supabase no usado en lookup_address');
  }),
}));

jest.mock('../../shared/geo/osrm.js', () => ({
  getRouteMetricsByAddress: jest.fn(),
}));

const { getRouteMetricsByAddress } = require('../../shared/geo/osrm.js');
const { lookupAddress, runTripIntentTool } = require('../../src/lib/tripIntentTools');
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

  it('resuelve POI terminal sin inventar dirección', () => {
    const result = lookupAddress('la terminal');
    expect(result.found).toBe(true);
    expect(result.kind).toBe('poi');
    expect(result.canonical).toMatch(/terminal/i);
    expect(result.needs_number).toBe(false);
  });

  it('pide GPS si dice acá', () => {
    const result = lookupAddress('aca');
    expect(result.found).toBe(false);
    expect(result.needs_gps).toBe(true);
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
});
