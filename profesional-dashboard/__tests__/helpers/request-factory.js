/**
 * request-factory.js — Helpers para crear objetos Request / Response de Next.js
 * compatibles con el App Router para usarlos en tests de API routes.
 *
 * Uso:
 *   const req = makePostRequest({ event: 'messages.upsert', data: { ... } });
 *   const req = makeGetRequest({ authorization: 'Bearer test-cron-secret' });
 *   const req = makeGetRequest({ query: { health: '1' } });
 */

const BASE_URL = 'http://localhost:3000';

/**
 * Crea un POST Request con body JSON.
 * @param {object} body  — payload del webhook WaSender
 * @param {object} [headers] — headers adicionales
 */
function makePostRequest(body = {}, headers = {}) {
  return new Request(`${BASE_URL}/api/Agente_IA`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Crea un GET Request (cron o health check).
 * @param {object} [options]
 * @param {object} [options.headers]  — headers adicionales (ej: authorization)
 * @param {object} [options.query]   — query string params (ej: { health: '1' })
 */
function makeGetRequest({ headers = {}, query = {} } = {}) {
  const url = new URL(`${BASE_URL}/api/Agente_IA`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), {
    method: 'GET',
    headers: {
      ...headers,
    },
  });
}

// ── Payloads WaSender de ejemplo ─────────────────────────────────────────────

/**
 * Evento de mensaje de texto entrante (messages.upsert).
 * @param {string} phone  — número del pasajero con código de país (ej: '5493878630173')
 * @param {string} text   — texto del mensaje
 * @param {string} [msgId]
 */
function makeTextMessageEvent(phone, text, msgId = `msg-${Date.now()}`) {
  return {
    event: 'messages.upsert',
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: false,
        id: msgId,
      },
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: 'Pasajero Test',
    },
  };
}

/**
 * Evento de ubicación GPS compartida por el pasajero.
 * @param {string} phone
 * @param {{ lat: number, lng: number, address?: string }} location
 */
function makeLocationEvent(phone, { lat, lng, address = '' }) {
  return {
    event: 'messages.upsert',
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: false,
        id: `loc-${Date.now()}`,
      },
      message: {
        locationMessage: {
          degreesLatitude: lat,
          degreesLongitude: lng,
          address,
          name: address,
        },
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
}

/**
 * Evento de resultado de poll (pasajero votó una opción).
 * @param {string} phone
 * @param {string} pollMsgId  — id del mensaje del poll enviado por el bot
 * @param {string} selectedOption  — texto de la opción votada
 */
function makePollResultEvent(phone, pollMsgId, selectedOption) {
  return {
    event: 'poll.results',
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: true,
        id: pollMsgId,
      },
      pollResult: [
        { name: selectedOption, voters: [`${phone}@s.whatsapp.net`] },
      ],
    },
  };
}

/**
 * Evento de transición de viaje (interno, disparado por el dashboard).
 * @param {string} tripId
 * @param {string} secret
 */
function makeTripTransitionEvent(tripId, secret = 'test-transition-secret') {
  return {
    event: 'trip.transition',
    tripId,
    _secret: secret,
  };
}

module.exports = {
  makePostRequest,
  makeGetRequest,
  makeTextMessageEvent,
  makeLocationEvent,
  makePollResultEvent,
  makeTripTransitionEvent,
};
