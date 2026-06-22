/**
 * Google Places API (New) — política de facturación estricta.
 *
 * SKUs permitidos EXCLUSIVAMENTE:
 *   1) Autocomplete Requests          → POST /v1/places:autocomplete
 *   2) Autocomplete Session Usage     → requests 13+ de la misma sesión ($0)
 *   3) Place Details Essentials (IDs Only) → GET places/{id} con mask "id" ($0)
 *
 * PROHIBIDO (disparan Place Details Pro / Essentials de pago):
 *   - location, displayName, shortFormattedAddress, addressComponents
 *   - Find Place, Text Search, Legacy Places, Google Geocoding API
 *
 * Nombres/subtítulos: Autocomplete structuredFormat (cacheados por placeId).
 * Coordenadas: Nominatim/OSM únicamente (osmGeocode.js).
 */

const { isWithinSaltaCapital } = require('./mapConfig');
const { geocodeCoordsFromAddress, geocodeCoordsFromPoiLabel } = require('./osmGeocode');

const PLACES_NEW_BASE = 'https://places.googleapis.com/v1';

const PLACES_TIMEOUT_MS = 8000;
const AUTOCOMPLETE_TTL_MS = 45 * 1000;
const LABEL_CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ITEMS = 300;

const SALTA_BIAS = {
  circle: {
    center: { latitude: -24.7829, longitude: -65.4122 },
    radius: 22000,
  },
};

const AUTOCOMPLETE_FIELD_MASK = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.structuredFormat',
  'suggestions.placePrediction.text',
  'suggestions.placePrediction.types',
].join(',');

/** SKU: Place Details Essentials (IDs Only) — solo devuelve id, $0. */
const PLACE_DETAILS_IDS_ONLY_MASK = 'id';

const FORBIDDEN_PLACE_DETAILS_FIELDS = [
  'location',
  'displayName',
  'shortFormattedAddress',
  'formattedAddress',
  'addressComponents',
  'viewport',
  'rating',
  'photos',
];

const FORBIDDEN_URL_PATTERNS = [
  /textsearch/i,
  /findplacefromtext/i,
  /places:searchText/i,
  /searchNearby/i,
  /maps\.googleapis\.com\/maps\/api\/place/i,
  /maps\.googleapis\.com\/maps\/api\/geocode/i,
];

const autocompleteCache = new Map();
const placeLabelCache = new Map();
const inFlightAutocomplete = new Map();
const inFlightPlaceIdConfirm = new Map();
const activeSessions = new Map();

function normalizeQuery(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function foldText(text) {
  return normalizeQuery(String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

function getCached(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return hit.data;
}

function setCached(map, key, data, ttlMs) {
  map.set(key, { data, expiresAt: Date.now() + ttlMs });
  if (map.size > CACHE_MAX_ITEMS) {
    const oldest = map.keys().next().value;
    if (oldest) map.delete(oldest);
  }
}

function readGoogleApiKey() {
  if (typeof process === 'undefined' || !process.env) return '';
  return String(
    process.env.GOOGLE_MAPS_API_KEY
    || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    || '',
  ).trim();
}

function isGoogleConfigured() {
  return Boolean(readGoogleApiKey());
}

function isGooglePlaceId(placeId) {
  return String(placeId || '').startsWith('google:');
}

function fixCommonPoiTypos(query) {
  const text = String(query || '').trim();
  if (!text) return text;
  return text
    .replace(/\bshoping\b/ig, 'shopping')
    .replace(/\bshopin\b/ig, 'shopping')
    .replace(/\bsho+p+i+n+g\b/ig, 'shopping')
    .replace(/\bjarava\b/ig, 'Jaraba')
    .replace(/\bfransisca\b/ig, 'Francisca');
}

function assertAllowedUrl(url) {
  if (FORBIDDEN_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    throw new Error('Endpoint de Google Places prohibido por política de costos');
  }
}

function assertPlaceDetailsIdsOnlyMask(fieldMask) {
  const normalized = String(fieldMask || '').replace(/\s/g, '');
  if (normalized !== 'id') {
    throw new Error(
      `Field mask no permitido. Solo: ${PLACE_DETAILS_IDS_ONLY_MASK} (SKU: IDs Only)`,
    );
  }
  for (const forbidden of FORBIDDEN_PLACE_DETAILS_FIELDS) {
    if (normalized.includes(forbidden)) {
      throw new Error(`Campo prohibido en Place Details: ${forbidden}`);
    }
  }
}

function assertSessionForPlaceDetails(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) {
    throw new Error('sessionToken requerido para cerrar sesión de Autocomplete');
  }
}

function createSessionToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function registerAutocompleteSession(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) return createSessionToken();
  const existing = activeSessions.get(token) || { requestCount: 0, completed: false };
  existing.requestCount += 1;
  activeSessions.set(token, existing);
  return token;
}

function completeSession(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) return;
  const existing = activeSessions.get(token) || { requestCount: 0, completed: false };
  existing.completed = true;
  activeSessions.set(token, existing);
}

function resolveSessionToken(options = {}) {
  const explicit = String(options?.sessionToken || '').trim();
  if (explicit) return explicit;
  return createSessionToken();
}

function cleanAutocompleteSubtitle(text) {
  return String(text || '')
    .replace(/,?\s*Argentina\s*$/i, '')
    .replace(/,?\s*A4400\s*$/i, '')
    .trim();
}

function cachePlaceLabel(rawPlaceId, label) {
  const id = String(rawPlaceId || '').trim();
  if (!id || !label?.title) return;
  setCached(placeLabelCache, id, label, LABEL_CACHE_TTL_MS);
}

function lookupPlaceLabel(rawPlaceId) {
  const id = String(rawPlaceId || '').replace(/^google:/, '').trim();
  return getCached(placeLabelCache, id);
}

function mapGoogleTypes(types) {
  const t = Array.isArray(types) ? types : [];
  if (t.some((x) => ['hospital', 'doctor', 'health'].includes(x))) return { osmClass: 'amenity', osmType: 'hospital' };
  if (t.some((x) => ['university', 'school', 'primary_school'].includes(x))) return { osmClass: 'amenity', osmType: 'university' };
  if (t.includes('shopping_mall')) return { osmClass: 'shop', osmType: 'mall' };
  if (t.includes('stadium')) return { osmClass: 'leisure', osmType: 'stadium' };
  if (t.includes('museum')) return { osmClass: 'tourism', osmType: 'museum' };
  if (t.some((x) => ['bus_station', 'transit_station'].includes(x))) return { osmClass: 'amenity', osmType: 'bus_station' };
  if (t.includes('airport')) return { osmClass: 'aeroway', osmType: 'aerodrome' };
  if (t.includes('pharmacy')) return { osmClass: 'amenity', osmType: 'pharmacy' };
  if (t.some((x) => ['bank', 'atm'].includes(x))) return { osmClass: 'amenity', osmType: 'bank' };
  if (t.some((x) => ['supermarket', 'grocery_or_supermarket'].includes(x))) return { osmClass: 'amenity', osmType: 'supermarket' };
  if (t.some((x) => ['restaurant', 'cafe', 'food', 'ice_cream_shop'].includes(x))) return { osmClass: 'amenity', osmType: 'restaurant' };
  if (t.includes('gas_station')) return { osmClass: 'amenity', osmType: 'fuel' };
  return { osmClass: 'amenity', osmType: 'poi' };
}

function scoreAutocompleteSuggestion(mainText, secondaryText, query) {
  const q = foldText(query);
  const title = foldText(mainText);
  const subtitle = foldText(secondaryText);
  let score = 0;
  if (title === q) score += 4.2;
  else if (title.startsWith(q)) score += 2.8;
  else if (title.includes(q)) score += 1.9;
  if (subtitle.includes(q)) score += 0.7;
  if (subtitle.includes('salta') || title.includes('salta')) score += 0.9;
  return score;
}

function mapAutocompletePrediction(prediction, sessionToken, query) {
  const rawId = String(prediction?.placeId || '').trim();
  if (!rawId) return null;

  const mainText = String(prediction?.structuredFormat?.mainText?.text || '').trim();
  const secondaryText = cleanAutocompleteSubtitle(
    prediction?.structuredFormat?.secondaryText?.text || '',
  );
  const types = Array.isArray(prediction?.types) ? prediction.types : [];
  const { osmClass, osmType } = mapGoogleTypes(types);

  const address = secondaryText ? `${mainText}, ${secondaryText}` : mainText;
  cachePlaceLabel(rawId, { title: mainText, subtitle: secondaryText, address });

  return {
    placeId: `google:${rawId}`,
    poiName: mainText,
    title: mainText,
    subtitle: secondaryText,
    formattedAddress: secondaryText || mainText,
    importance: 0.75,
    osmClass,
    osmType,
    address: { city: 'Salta' },
    sessionToken,
    types,
    _score: scoreAutocompleteSuggestion(mainText, secondaryText, query),
  };
}

async function placesAutocompleteRequest(input, sessionToken) {
  const text = String(input || '').trim();
  if (!text || !isGoogleConfigured()) return [];

  const key = readGoogleApiKey();
  const url = `${PLACES_NEW_BASE}/places:autocomplete`;
  assertAllowedUrl(url);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS) : null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify({
        input: text,
        sessionToken,
        includedRegionCodes: ['ar'],
        languageCode: 'es',
        locationBias: SALTA_BIAS,
      }),
      signal: controller?.signal,
    });

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * SKU: Autocomplete (New) — devuelve sugerencias estilo Google Maps sin coords.
 */
async function autocompleteAddressSalta(query, limit = 8, options = {}) {
  const text = fixCommonPoiTypos(String(query || '').trim());
  if (!text || text.length < 2 || !isGoogleConfigured()) return [];

  const normalizedLimit = Math.max(1, Math.min(limit, 8));
  const sessionToken = registerAutocompleteSession(resolveSessionToken(options));
  const cacheKey = `${normalizeQuery(text)}::${normalizedLimit}::${sessionToken}`;
  const cached = getCached(autocompleteCache, cacheKey);
  if (cached) return cached;
  if (inFlightAutocomplete.has(cacheKey)) return inFlightAutocomplete.get(cacheKey);

  const requestPromise = (async () => {
    const suggestions = await placesAutocompleteRequest(text, sessionToken);
    const mapped = suggestions
      .map((item) => mapAutocompletePrediction(item?.placePrediction, sessionToken, text))
      .filter(Boolean)
      .sort((a, b) => b._score - a._score)
      .slice(0, normalizedLimit)
      .map(({ _score, ...rest }) => rest);

    setCached(autocompleteCache, cacheKey, mapped, AUTOCOMPLETE_TTL_MS);
    return mapped;
  })();

  inFlightAutocomplete.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightAutocomplete.delete(cacheKey);
  }
}

const searchPoiSalta = autocompleteAddressSalta;

/**
 * SKU: Place Details Essentials (IDs Only) — solo confirma el place_id ($0).
 */
async function confirmPlaceIdOnly(rawPlaceId, sessionToken) {
  const placeId = String(rawPlaceId || '').trim();
  const token = String(sessionToken || '').trim();
  if (!placeId || !token || !isGoogleConfigured()) return null;

  assertSessionForPlaceDetails(token);
  assertPlaceDetailsIdsOnlyMask(PLACE_DETAILS_IDS_ONLY_MASK);

  const cacheKey = `${placeId}::${token}`;
  const cached = getCached(placeLabelCache, `confirm:${cacheKey}`);
  if (cached) return cached;
  if (inFlightPlaceIdConfirm.has(cacheKey)) return inFlightPlaceIdConfirm.get(cacheKey);

  const requestPromise = (async () => {
    const key = readGoogleApiKey();
    const url = `${PLACES_NEW_BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(token)}`;
    assertAllowedUrl(url);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS) : null;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': PLACE_DETAILS_IDS_ONLY_MASK,
        },
        signal: controller?.signal,
      });
      if (!response.ok) return null;

      const data = await response.json();
      const confirmedId = String(data?.id || placeId).trim();
      if (!confirmedId) return null;

      completeSession(token);
      const result = { placeId: confirmedId };
      setCached(placeLabelCache, `confirm:${cacheKey}`, result, LABEL_CACHE_TTL_MS);
      return result;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();

  inFlightPlaceIdConfirm.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightPlaceIdConfirm.delete(cacheKey);
  }
}

/** @deprecated alias */
const confirmPlaceInSession = confirmPlaceIdOnly;

function buildGoogleMapsSubtitle(item) {
  return cleanAutocompleteSubtitle(item?.subtitle || item?.shortAddress || '');
}

function resolveFormattedAddress(rawPlaceId, options = {}) {
  const explicit = String(options?.formattedAddress || '').trim();
  if (explicit) return explicit;

  const cached = lookupPlaceLabel(rawPlaceId);
  if (cached?.address) return cached.address;

  const title = String(options?.title || '').trim();
  const subtitle = String(options?.subtitle || '').trim();
  if (title && subtitle) return `${title}, ${subtitle}`;
  return title || '';
}

function buildGeocodeQueries(formattedAddress, options = {}) {
  const title = String(options?.title || '').trim();
  const subtitle = String(options?.subtitle || '').trim();
  const seen = new Set();
  const queries = [];

  const push = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(text);
  };

  if (title) push(`${title}, Salta, Argentina`);
  if (title && subtitle) push(`${title}, ${subtitle}`);
  push(formattedAddress);
  if (title) push(title);
  return queries;
}

async function resolveCoordsFallback(formattedAddress, options = {}) {
  const title = String(options?.title || '').trim();
  const subtitle = String(options?.subtitle || '').trim();

  if (title) {
    try {
      const coords = await geocodeCoordsFromPoiLabel({ title, subtitle, formattedAddress });
      if (isWithinSaltaCapital(coords.lat, coords.lng)) {
        return coords;
      }
    } catch {
      // fallback a búsqueda por dirección
    }
  }

  const queries = buildGeocodeQueries(formattedAddress, options);

  for (const query of queries) {
    try {
      const coords = await geocodeCoordsFromAddress(query);
      if (isWithinSaltaCapital(coords.lat, coords.lng)) {
        return {
          ...coords,
          formattedAddress: formattedAddress || coords.formattedAddress,
        };
      }
    } catch {
      // siguiente variante
    }
  }

  throw new Error('No se encontró la dirección en OSM/Nominatim');
}

/**
 * Confirma place_id (IDs Only) y obtiene coordenadas vía Nominatim/OSM.
 */
async function getGooglePlaceDetails(placeId, options = {}) {
  const rawId = String(placeId || '').replace(/^google:/, '').trim();
  if (!rawId) throw new Error('place_id de Google inválido');
  if (!isGoogleConfigured()) throw new Error('GOOGLE_MAPS_API_KEY no configurada');

  const sessionToken = String(options?.sessionToken || '').trim();
  const formattedAddress = resolveFormattedAddress(rawId, options);
  if (!formattedAddress) {
    throw new Error('Dirección no disponible para geocodificar con OSM');
  }

  const confirmed = await confirmPlaceIdOnly(rawId, sessionToken);
  if (!confirmed?.placeId) {
    throw new Error('No se pudo confirmar el lugar en Google Places');
  }

  const coords = await resolveCoordsFallback(formattedAddress, options);
  if (!isWithinSaltaCapital(coords.lat, coords.lng)) {
    throw new Error('La dirección debe estar en Salta Capital');
  }

  return {
    lat: coords.lat,
    lng: coords.lng,
    formattedAddress,
    placeId: `google:${confirmed.placeId}`,
  };
}

async function geocodeAddressGoogle(address, options = {}) {
  const text = String(address || '').trim();
  if (!text) throw new Error('Dirección vacía');

  const sessionToken = resolveSessionToken(options);
  const suggestions = await autocompleteAddressSalta(text, 1, { sessionToken });
  const best = suggestions[0];
  if (!best?.placeId) {
    throw new Error('No se encontró la dirección');
  }

  return getGooglePlaceDetails(best.placeId, {
    sessionToken,
    formattedAddress: best.poiName && best.formattedAddress
      ? `${best.poiName}, ${best.formattedAddress}`
      : (best.formattedAddress || best.poiName),
    title: best.poiName,
    subtitle: best.formattedAddress,
  });
}

module.exports = {
  autocompleteAddressSalta,
  searchPoiSalta,
  getGooglePlaceDetails,
  geocodeAddressGoogle,
  isGooglePlaceId,
  isGoogleConfigured,
  buildGoogleMapsSubtitle,
  createSessionToken,
  registerAutocompleteSession,
  completeSession,
  lookupPlaceLabel,
};
