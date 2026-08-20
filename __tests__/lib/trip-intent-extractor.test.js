jest.mock('../../src/lib/deepseekClient', () => ({
  isDeepSeekConfigured: jest.fn(() => true),
  getDeepSeekProModel: jest.fn(() => 'deepseek-v4-pro'),
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

describe('extractTripIntentHybrid + DeepSeek Pro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clasifica pedido con direcciones usando DeepSeek Pro, no el refine de Flash', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'trip_request',
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
    expect(deepseekChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'trip_intent',
        model: 'deepseek-v4-pro',
        jsonMode: true,
      }),
    );
    expect(result.intent).toBe('trip_request');
    expect(result.pickup_location).toBe('Mitre 200, Salta');
    expect(result.destination).toBe('Güemes 400, Salta');
    expect(result.source).toBe('deepseek-pro');
    expect(logs.some((entry) => entry.stage === 'ai_extract_intent_deepseek_pro')).toBe(true);
    expect(logs.some((entry) => entry.stage === 'ai_extract_intent_ok')).toBe(true);
  });

  it('prioriza direcciones de DeepSeek Pro aunque el patrón haya contaminado el retiro con ", me"', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'trip_request',
        pickup_location: 'Juan Gálvez 218, Salta',
        destination: 'Tadeo Tadia 500, Salta',
        confidence: 0.88,
      }),
      usage: {},
    });

    const text =
      'Hola, me mandas un remis a Juan Gálvez 218, me voy para Tadeo tadia al 500';
    const result = await extractTripIntentHybrid({
      combinedText: text,
      context: {},
      pushName: 'Juan',
      phone: '5493878630173',
      inferHeuristics: inferTripHeuristics,
    });

    expect(result.intent).toBe('trip_request');
    expect(result.pickup_location).toBe('Juan Gálvez 218, Salta');
    expect(result.destination).toBe('Tadeo Tadia 500, Salta');
    expect(result.pickup_location).not.toMatch(/,\s*me\b/i);
  });

  it('usa direcciones de DeepSeek Pro aunque devuelva confidence baja', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'trip_request',
        pickup_location: 'Juan Gálvez 218, Salta',
        destination: 'Tadeo Tadia 500, Salta',
        confidence: 0,
      }),
      usage: {},
    });

    const text =
      'Hola, me mandas un remis a Juan Gálvez 218, me voy para Tadeo tadia al 500';
    const result = await extractTripIntentHybrid({
      combinedText: text,
      context: {},
      pushName: 'Juan',
      phone: '5493878630173',
      inferHeuristics: inferTripHeuristics,
    });

    expect(result.pickup_location).toBe('Juan Gálvez 218, Salta');
    expect(result.destination).toBe('Tadeo Tadia 500, Salta');
  });

  it('no rellena pickup si Pro lo deja en null, aunque la heurística invente una calle', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'other',
        pickup_location: null,
        destination: null,
        confidence: 0.9,
        missing_fields: [],
      }),
      usage: {},
    });

    const result = await extractTripIntentHybrid({
      combinedText: 'tienen movil',
      context: {},
      pushName: 'Carlos',
      phone: '5493878630173',
      inferHeuristics: () => ({
        pickup: 'tienen',
        destination: null,
        looksLikeTripRequest: true,
      }),
    });

    expect(deepseekChatCompletion).toHaveBeenCalledTimes(1);
    expect(deepseekChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'deepseek-v4-pro', purpose: 'trip_intent' }),
    );
    expect(result.intent).toBe('other');
    expect(result.pickup_location).toBeNull();
    expect(result.source).toBe('deepseek-pro');
    expect(result.reply).toMatch(/calle y altura/i);
    expect(result.reply).toMatch(/ubicaci[oó]n GPS/i);
  });

  it('corrige a other si Pro trata "tienen movil" como viaje o calle Tienen', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'trip_request',
        pickup_location: 'Tienen',
        destination: null,
        confidence: 0.7,
      }),
      usage: {},
    });

    const result = await extractTripIntentHybrid({
      combinedText: 'tienen movil',
      context: {},
      pushName: 'Carlos',
      phone: '5493878630173',
      inferHeuristics: () => ({
        pickup: 'tienen',
        destination: null,
        looksLikeTripRequest: true,
      }),
    });

    expect(result.pickup_location).toBeNull();
    expect(result.intent).toBe('other');
    expect(result.reply).toMatch(/calle y altura/i);
    expect(result.reply).toMatch(/ubicaci[oó]n GPS/i);
  });

  it('pasa el retiro parcial a Pro cuando espera la altura', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'trip_request',
        pickup_location: 'Belgrano 300, Salta',
        destination: null,
        confidence: 0.9,
        missing_fields: [],
      }),
      usage: {},
    });

    await extractTripIntentHybrid({
      combinedText: '300',
      context: {
        awaiting_pickup_number: true,
        pickup_location: 'Belgrano, Salta',
      },
      pushName: 'Juan',
      phone: '5493878630173',
      lastBotReply: '¿A qué altura de Belgrano?',
      inferHeuristics: inferTripHeuristics,
    });

    expect(deepseekChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-v4-pro',
        userContent: expect.stringMatching(/Belgrano/),
      }),
    );
  });

  it('pasa historial reciente a DeepSeek Pro', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'other',
        pickup_location: null,
        confidence: 0.8,
        reply: 'Sí, decime de dónde te buscamos.',
      }),
      usage: {},
    });

    await extractTripIntentHybrid({
      combinedText: 'tienen movil',
      context: {},
      pushName: 'Carlos',
      phone: '5493878630173',
      history: [
        { direction: 'outgoing', content: 'Hola, soy el Chat Bot Betto. Contame el viaje.' },
      ],
      inferHeuristics: inferTripHeuristics,
    });

    expect(deepseekChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        historyMessages: [
          { role: 'assistant', content: 'Hola, soy el Chat Bot Betto. Contame el viaje.' },
        ],
      }),
    );
  });

  it('no pide referencia si Pro lo escribe en el reply', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        intent: 'other',
        pickup_location: null,
        confidence: 0.8,
        reply: 'Hola Carlos, ¿me pasás la calle y número o una referencia para buscarte?',
      }),
      usage: {},
    });

    const result = await extractTripIntentHybrid({
      combinedText: 'tienen movil',
      context: {},
      pushName: 'Carlos',
      phone: '5493878630173',
      inferHeuristics: inferTripHeuristics,
    });

    expect(result.reply).toMatch(/calle y altura/i);
    expect(result.reply).toMatch(/ubicaci[oó]n GPS/i);
    expect(result.reply).not.toMatch(/referencia/i);
    expect(result.reply).not.toMatch(/Hola Carlos/i);
  });

  it('un hola con GPS pendiente no llama a Pro y pide calle y altura o GPS', async () => {
    const result = await extractTripIntentHybrid({
      combinedText: 'hola',
      context: { awaiting_gps: true },
      pushName: 'Carlos',
      phone: '5493878630173',
      inferHeuristics: inferTripHeuristics,
    });

    expect(deepseekChatCompletion).not.toHaveBeenCalled();
    expect(result.intent).toBe('other');
    expect(result.reply).toMatch(/calle y altura/i);
    expect(result.reply).toMatch(/ubicaci[oó]n GPS/i);
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

  it('cotización sin direcciones no llama a Pro y no es trip_request', async () => {
    const result = await extractTripIntentHybrid({
      combinedText: 'queria saber el precio de un viaje',
      context: {},
      pushName: 'Juan',
      phone: '5493878630173',
      inferHeuristics: inferTripHeuristics,
    });

    expect(deepseekChatCompletion).not.toHaveBeenCalled();
    expect(result.intent).toBe('price_inquiry');
    expect(result.missing_fields).toEqual(expect.arrayContaining(['pickup_location', 'destination']));
    expect(result.reply).toMatch(/origen/i);
  });

  it('después de pedir el origen de una cotización, una dirección no despacha el viaje', async () => {
    const result = await extractTripIntentHybrid({
      combinedText: 'mitre 200',
      context: {
        price_inquiry: true,
        awaiting_price_origin: true,
      },
      pushName: 'Juan',
      phone: '5493878630173',
      lastBotReply: 'Para darte el precio necesito las dos direcciones. ¿Cuál es el *origen* del viaje? (calle y número)',
      inferHeuristics: inferTripHeuristics,
    });

    expect(deepseekChatCompletion).not.toHaveBeenCalled();
    expect(result.intent).toBe('price_inquiry');
    expect(result.pickup_location).toMatch(/mitre 200/i);
    expect(result.destination).toBeNull();
    expect(result.missing_fields).toContain('destination');
  });

  it('si responden el origen con origen y destino juntos, no despacha y no pide destino de nuevo', async () => {
    const result = await extractTripIntentHybrid({
      combinedText: 'mitre 200 a guemes 400',
      context: {
        price_inquiry: true,
        awaiting_price_origin: true,
      },
      pushName: 'Juan',
      phone: '5493878630173',
      lastBotReply: 'Para darte el precio necesito las dos direcciones. ¿Cuál es el *origen* del viaje? (calle y número)',
      inferHeuristics: inferTripHeuristics,
    });

    expect(deepseekChatCompletion).not.toHaveBeenCalled();
    expect(result.intent).toBe('price_inquiry');
    expect(result.pickup_location).toMatch(/mitre 200/i);
    expect(result.destination).toMatch(/guemes 400/i);
    expect(result.missing_fields).toEqual([]);
  });
});
