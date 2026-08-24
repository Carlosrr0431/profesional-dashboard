const fs = require('fs');
const path = require('path');
const {
  extractTripPickupHeuristic,
} = require('../../src/lib/whatsappTripAddressParse');
const {
  classifyWhatsAppIncomingText,
  looksLikeTripRequest,
  looksLikeScheduleTrip,
  looksLikeStatusQuery,
  looksLikeAddressText,
  isAvailabilityAskWithoutRoute,
} = require('../../src/lib/whatsappTripIntentPatterns');
const { resolveLookupAddress } = require('../../src/lib/tripIntentTools');
const { matchCatalogStreetPhrase, normalizeStreetKey } = require('../../shared/salta-street-lookup');
const { resolveSaltaKnownPoi } = require('../../src/lib/saltaKnownPois');

const JSON_PATH = path.join(__dirname, '../../data/formas-pedir-viaje.json');

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorpusNoise(text) {
  const n = fold(text);
  if (looksLikeStatusQuery(text)) return true;
  return (
    /faja del auto/.test(n)
    || /no me impacto el pago/.test(n)
    || /pidio una auto para pagar/.test(n)
    || /hace \d+ pedi/.test(n)
    || /te pedis un auto para irte/.test(n)
    || /avisar cuando este el movil/.test(n)
    || /el movil que se solicito/.test(n)
    || /soria pide un auto/.test(n)
    || /por la app/.test(n)
    || /sres me puede decir/.test(n)
    || /recien llegue a dejar la camioneta/.test(n)
  );
}

function stripTimeAndRooms(text) {
  return fold(text)
    .replace(/\b(?:a|para)\s+las?\s+\d{1,2}(?:\s*[:.]\s*\d{2})?(?:\s*(?:hs|hrs|am|pm))?/g, ' ')
    .replace(/\b\d{1,2}\s*[:.]\s*\d{2}(?:\s*(?:hs|hrs|am|pm))?/g, ' ')
    .replace(/\b\d{1,2}\s+y\s+\d{1,2}\s*(?:hs|hrs)?\b/g, ' ')
    .replace(/\bhab(?:itacion)?\s*\d+[a-z]?\b/g, ' ')
    .replace(/\b\d{3,4}\s*(?:hs|hrs|am|pm)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expectedPickupTokens(text) {
  const pickupSpan = pickupSpanFromText(text);
  const tokens = [];

  if (/\bmonoblo/.test(pickupSpan)) {
    tokens.push('monoblock');
    if (/\bsarmiento\b/.test(pickupSpan)) tokens.push('sarmiento');
  }
  if (/\bsheraton\b/.test(pickupSpan)) tokens.push('sheraton');
  if (/\bdesign\s+suites\b/.test(pickupSpan)) tokens.push('design');
  if (/\bcarrefour\b/.test(pickupSpan)) tokens.push('carrefour');
  if (/\bgrido\b/.test(pickupSpan)) tokens.push('grido');
  if (/\bvelez\b/.test(pickupSpan)) tokens.push('velez');
  if (/\bzuviria\b/.test(pickupSpan) || /\bzzuviria\b/.test(pickupSpan)) tokens.push('zuviria');

  const namedPoi = tokens.length > 0;
  if (!/\bbarrio\b/.test(pickupSpan) && !namedPoi) {
    const poi = resolveSaltaKnownPoi(pickupSpan);
    if (poi?.label && !/\b(estacion|terminal|aeropuerto|tren)\b/.test(fold(poi.label))) {
      const labelBits = fold(poi.label)
        .split(' ')
        .filter((bit) => bit.length >= 4 && !['salta', 'capital', 'hotel', 'clinica'].includes(bit));
      for (const bit of labelBits.slice(0, 2)) {
        if (!tokens.includes(bit)) tokens.push(bit);
      }
    }
  }

  if (/\bogigg?ins\b/.test(pickupSpan) || /\bhiggins\b/.test(pickupSpan)) {
    tokens.push('higgins');
    const house = pickupSpan.match(/\b(\d{3,5})\b/);
    if (house && !tokens.includes(house[1])) tokens.push(house[1]);
  }

  if (!tokens.includes('carrefour') && !/\bshow\s+de\b/.test(pickupSpan) && !tokens.includes('higgins')) {
    const words = pickupSpan.split(' ').filter((word) => word.length >= 2);
    const street = matchCatalogStreetPhrase(words);
    if (street) {
      const streetBits = normalizeStreetKey(street.name)
        .split(/[-\s]+/)
        .filter((bit) => bit.length >= 3);
      const streetBit = streetBits.includes('guemes')
        ? 'guemes'
        : (streetBits.find((bit) => !['cnel', 'gral', 'avda'].includes(bit) && bit.length >= 4) || streetBits[streetBits.length - 1]);
      const houseMatch = pickupSpan.match(
        new RegExp(`${streetBits[streetBits.length - 1]}\\s+(\\d{1,5})\\b`),
      ) || pickupSpan.match(/\b([a-z]{3,})\s+(\d{3,5})\b/);
      const house = houseMatch ? houseMatch[houseMatch.length - 1] : null;
      if (streetBit && !tokens.includes(streetBit)) tokens.push(streetBit);
      if (house && house.length >= 3 && !tokens.includes(house)) tokens.push(house);
    }
  }

  return tokens;
}

function pickupSpanFromText(text) {
  const span = stripTimeAndRooms(text);
  const desde = span.match(/\bdesde\s+(.+)$/);
  if (desde) return desde[1];
  return span.split(/\b(?:hasta|hacia|destino|para ir|van al?|van a(?: la)?|llevame a)\b/)[0];
}

function pickupCoversTokens(pickupFolded, expected) {
  return expected.every((token) => {
    if (token === 'guemes' || token === 'general guemes') {
      return /guemes/.test(pickupFolded);
    }
    if (token.includes('suarez') && (token.includes('cnel') || token.includes('coronel'))) {
      return /(?:cnel|coronel)/.test(pickupFolded) && /suarez/.test(pickupFolded);
    }
    if (token === '20 de febrero') {
      return /20/.test(pickupFolded) && /febrero/.test(pickupFolded);
    }
    if (token === 'entre rios' || token === 'entre') {
      return /carrefour/.test(pickupFolded) || (/entre/.test(pickupFolded) && /rios/.test(pickupFolded));
    }
    return pickupFolded.includes(token);
  });
}

async function resolvePickup(text) {
  const heuristic = extractTripPickupHeuristic(text);
  const query = heuristic.pickup || text;
  const looked = await resolveLookupAddress(query);
  let pickup = heuristic.pickup;
  if (looked?.found && looked.canonical) pickup = looked.canonical;
  return {
    pickup,
    destination: heuristic.destination,
    classified: classifyWhatsAppIncomingText(text),
  };
}

function isTripLike(text, formaIntent, classified) {
  if (formaIntent === 'schedule_trip') {
    return (
      looksLikeScheduleTrip(text)
      || classified.intentHint === 'schedule_trip'
      || looksLikeTripRequest(text)
    );
  }
  return (
    looksLikeTripRequest(text)
    || looksLikeAddressText(text)
    || classified.intentHint === 'trip_request'
    || classified.intentHint === 'schedule_trip'
    || classified.intentHint === 'address_reply'
  );
}

const hasJson = fs.existsSync(JSON_PATH);

(hasJson ? describe : describe.skip)('formas-pedir-viaje.json', () => {
  const data = hasJson ? JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) : { formas: [] };
  const cases = [];
  for (const forma of data.formas || []) {
    for (const ejemplo of forma.ejemplos || []) {
      cases.push({
        formaId: forma.id,
        intent: forma.intent,
        text: String(ejemplo || '').trim(),
      });
    }
  }
  for (const extra of data.otras_frases_de_pasajero || []) {
    cases.push({
      formaId: 'otras_frases',
      intent: 'trip_request',
      text: String(extra || '').trim(),
    });
  }

  it('carga el corpus de formas reales', () => {
    expect(cases.length).toBeGreaterThan(100);
  });

  it('toma cada pedido de viaje y la dirección cuando el mensaje la trae', async () => {
    const failures = [];

    for (const item of cases) {
      if (!item.text) continue;
      if (isCorpusNoise(item.text)) continue;
      if (isAvailabilityAskWithoutRoute(item.text)) continue;

      const expected = expectedPickupTokens(item.text);
      const resolved = await resolvePickup(item.text);
      const pickupFolded = fold(resolved.pickup || '');

      if (!isTripLike(item.text, item.intent, resolved.classified)) {
        failures.push({
          formaId: item.formaId,
          text: item.text,
          reason: `no se tomó como viaje (intent=${resolved.classified.intentHint})`,
        });
        continue;
      }

      if (expected.length === 0) continue;

      const missing = expected.filter((token) => !pickupCoversTokens(pickupFolded, [token]));
      if (missing.length > 0) {
        failures.push({
          formaId: item.formaId,
          text: item.text,
          reason: `dirección incompleta. faltan [${missing.join(', ')}]; pickup=${resolved.pickup || '(vacío)'}`,
        });
      }
    }

    if (failures.length > 0) {
      const preview = failures
        .slice(0, 25)
        .map((row) => `- [${row.formaId}] ${row.text.replace(/\s+/g, ' ').slice(0, 120)}\n    ${row.reason}`)
        .join('\n');
      throw new Error(
        `${failures.length} casos del corpus no tomaron bien el viaje o la dirección:\n${preview}`,
      );
    }
  }, 30000);
});
