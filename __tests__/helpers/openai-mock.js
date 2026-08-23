/**
 * openai-mock.js — Factory para mockear el cliente OpenAI v4.
 *
 * Cubre los dos usos del agente:
 *   1. chat.completions.create()  → extracción de intención (GPT)
 *   2. audio.transcriptions.create() → transcripción de audio (Whisper)
 *
 * Uso básico (intent trip_request):
 *   const openai = createOpenAIMock();
 *
 * Uso con intent personalizado:
 *   const openai = createOpenAIMock({
 *     intent: 'cancel_trip',
 *     pickup_location: null,
 *     reply: 'Viaje cancelado.'
 *   });
 *
 * Uso en el test (junto con jest.mock):
 *   jest.mock('openai');
 *   const OpenAI = require('openai').default;
 *   OpenAI.mockImplementation(() => createOpenAIMock({ intent: 'trip_request' }));
 */

function createOpenAIMock(extractedIntent = {}) {
  const defaultIntent = {
    intent: 'trip_request',
    pickup_location: 'Belgrano 200',
    pickup_lat: -24.79,
    pickup_lng: -65.41,
    destination: null,
    notes: null,
    missing_fields: [],
    cancel_confirmed: false,
    schedule_time: null,
    confidence: 0.9,
    reply: 'Perfecto, buscamos un remis para Belgrano 200.',
    new_trip: false,
    ...extractedIntent,
  };

  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify(defaultIntent),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_cache_hit_tokens: 80,
            prompt_cache_miss_tokens: 20,
          },
        }),
      },
    },
    responses: {
      create: jest.fn().mockResolvedValue({
        output_text: JSON.stringify(defaultIntent),
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify(defaultIntent) }],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
      }),
    },
    audio: {
      transcriptions: {
        create: jest.fn().mockResolvedValue({ text: 'Belgrano 200' }),
      },
    },
  };
}

module.exports = { createOpenAIMock };
