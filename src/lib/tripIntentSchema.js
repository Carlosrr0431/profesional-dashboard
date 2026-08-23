/** Schema y tools estables para Responses API (cache de contexto). Remis, no catálogo. */

export const TRIP_INTENT_JSON_SCHEMA = {
  name: 'trip_intent',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'intent',
      'passenger_name',
      'pickup_location',
      'origin',
      'destination',
      'notes',
      'reply',
      'confidence',
      'missing_fields',
      'cancel_confirmed',
      'schedule_time',
      'new_trip',
    ],
    properties: {
      intent: {
        type: 'string',
        enum: [
          'trip_request',
          'price_inquiry',
          'status_query',
          'cancel_trip',
          'schedule_trip',
          'ask_human',
          'other',
        ],
      },
      passenger_name: { type: ['string', 'null'] },
      pickup_location: { type: ['string', 'null'] },
      origin: { type: ['string', 'null'] },
      destination: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
      reply: { type: ['string', 'null'] },
      confidence: { type: 'number' },
      missing_fields: { type: 'array', items: { type: 'string' } },
      cancel_confirmed: { type: 'boolean' },
      schedule_time: { type: ['string', 'null'] },
      new_trip: { type: 'boolean' },
    },
  },
};

export const TRIP_INTENT_TOOLS = [
  {
    type: 'function',
    name: 'lookup_address',
    description:
      'Resuelve una dirección o POI real de Salta Capital. Usala para CADA retiro o destino antes de armar el JSON. No inventes calles. Si found=false, no pongas esa frase como pickup. Si ambiguous/homonym=guemes, dejá "Güemes N, Salta" sin expandir a Gral/Martín. Si needs_number, falta altura. Si needs_gps, pedí ubicación GPS.',
    strict: false,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Calle, POI o barrio que dijo el pasajero, ej: mitre 200, la terminal, güemes 300',
        },
      },
    },
  },
  {
    type: 'function',
    name: 'quote_fare',
    description:
      'Cotiza km y precio real con tarifa de la plataforma. Usala en price_inquiry cuando ya hay origen y destino. Si priced=false, no inventes km ni pesos.',
    strict: false,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['origin', 'destination'],
      properties: {
        origin: { type: 'string', description: 'Dirección de retiro ya resuelta' },
        destination: { type: 'string', description: 'Dirección de destino ya resuelta' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_service_status',
    description:
      'Móviles en línea ahora. Usala si preguntan si hay remis/servicio. El pedido se puede tomar igual; no inventes que están cerrados.',
    strict: false,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'get_trip_status',
    description:
      'Estado del viaje de este pasajero (abierto o el último cerrado). Usala en status_query. No inventes chofer, demora ni patente. Si found=false, no hay viaje.',
    strict: false,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
];
