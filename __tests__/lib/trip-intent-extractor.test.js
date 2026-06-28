jest.mock('../../src/lib/deepseekClient', () => ({
  isDeepSeekConfigured: jest.fn(() => true),
  deepseekChatCompletion: jest.fn(),
}));

const { deepseekChatCompletion } = require('../../src/lib/deepseekClient');
const { extractTripIntentHybrid } = require('../../src/lib/tripIntentExtractor');
const { extractFullTripByPattern } = require('../../src/lib/whatsappTripAddressParse');

function inferTripHeuristics(combinedText) {
  const trip = extractFullTripByPattern(combinedText);
  if (trip) {
    return {
      pickup: trip.pickup,
      destination: trip.destination,
      looksLikeTripRequest: true,
    };
  }
  return { pickup: null, destination: null, looksLikeTripRequest: false };
}

describe('extractTripIntentHybrid + DeepSeek refine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refina pickup y destino con DeepSeek aunque el patrón tenga alta confianza', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'trip_request',
        passenger_name: 'Juan',
        pickup_location: 'Mitre 200, Salta',
        destination: 'Güemes 400, Salta',
        confidence: 0.92,
        missing_fields: [],
      }),
      usage: {},
    });

    const text = 'hola, me mandas un remis a mitre al 200 es para ir hasta guemes al 400';
    const logs = [];
    const result = await extractTripIntentHybrid({
      combinedText: text,
      context: {},
      pushName: 'Juan',
      phone: '5493878630173',
      inferHeuristics: inferTripHeuristics,
      logFn: (stage, payload) => logs.push({ stage, payload }),
    });

    expect(deepseekChatCompletion).toHaveBeenCalledTimes(1);
    expect(result.intent).toBe('trip_request');
    expect(result.pickup_location).toBe('Mitre 200, Salta');
    expect(result.destination).toBe('Güemes 400, Salta');
    expect(logs.some((entry) => entry.stage === 'ai_extract_intent_deepseek_refine')).toBe(true);
  });

  it('no llama DeepSeek para saludos sin dirección', async () => {
    const result = await extractTripIntentHybrid({
      combinedText: 'hola',
      context: {},
      pushName: 'Juan',
      phone: '5493878630173',
      inferHeuristics: inferTripHeuristics,
    });

    expect(deepseekChatCompletion).not.toHaveBeenCalled();
    expect(result.intent).toBe('other');
  });
});
