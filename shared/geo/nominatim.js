const {
  NOMINATIM_BASE_URL,
  NOMINATIM_USER_AGENT,
  NOMINATIM_SELF_HOSTED,
  GOOGLE_POI_AUTOCOMPLETE_ENABLED,
  SALTA_VIEWBOX,
  SALTA_COUNTRY,
  queryNamesCoveredLocality,
  coordsAllowedForQuery,
} = require('./mapConfig');

const {
  buildAddressSearchQueries,
  getCatalogAddressVariants,
  scoreCandidateAgainstQuery,
  formatAddressSuggestion,
  formatNominatimDisplayLabel,
  formatNominatimLabelForQuery,
  applyQueryHouseNumberToLabel,
  parseStreetHouseFromQuery,
  pickPrimaryHouseNumber,
  ensureStreetCatalog,
  searchStreetCatalog,
} = require('../salta-address');

const {
  resolveSaltaKnownPoi,
  getKnownPoiSearchQueries,
  getKnownPoiPollSeeds,
  looksLikeSaltaKnownPoi,
  buildPoiAutocompleteQueries,
  normalizePoiText,
} = require('../salta-known-pois');
const { searchGeorefAddress, resolveGeorefPlaceId, fetchGeorefCalles } = require('./georef');
const { fuzzySearch: tomtomFuzzySearch, reverseGeocodeCoords: tomtomReverseGeocode } = require('./tomtomClient');

const PUBLIC_NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const {
  searchPoiSalta: googleSearchPoi,
  getGooglePlaceDetails,
  isGooglePlaceId,
  isGoogleConfigured,
} = require('./googlePlaces');

// Fallback a TomTom — solo cuando ni Nominatim ni Google Places encontraron
// suficientes resultados para una búsqueda de lugar/comercio sin número de calle.
async function searchTomTomPoiFallback(query, limit = 6) {
  const text = String(query || '').trim();
  if (!text) return [];

  const variants = [
    /salta/i.test(text) ? text : `${text}, Salta`,
    text,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const merged = [];
  const seen = new Set();

  for (const variant of variants) {
    try {
      const hits = await tomtomFuzzySearch(variant, { limit, idxSet: 'POI,PAD,Addr,Str' });
      for (const hit of hits) {
        const key = hit.placeId || `${hit.lat.toFixed(5)},${hit.lng.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...hit, osmType: hit.osmType === 'poi' ? 'poi' : hit.osmType });
      }
    } catch {
      // TomTom no disponible o sin clave → ignorar silenciosamente
    }
  }

  return merged;
}

const REQUEST_MIN_INTERVAL_MS = NOMINATIM_SELF_HOSTED ? 0 : 1100;
const NOMINATIM_TIMEOUT_MS = 12000;
const MAX_AUTOCOMPLETE_VARIANTS = 4;
const PARALLEL_BATCH = NOMINATIM_SELF_HOSTED ? 2 : 1;
const MIN_AUTOCOMPLETE_SCORE = 0.12;
const GEOREF_AUTOCOMPLETE_BONUS = 0.92;
const VAGUE_OSM_TYPES = new Set(['administrative', 'state', 'country', 'postcode']);
const OSM_POI_CLASSES = new Set([
  'amenity', 'shop', 'tourism', 'leisure', 'office', 'craft', 'healthcare', 'historic',
]);

let lastRequestAt = 0;
let requestChain = Promise.resolve();
let publicNominatimUntil = 0;

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function suggestionsFromKnownPoiSeeds(knownPoi, query) {
  return getKnownPoiPollSeeds(knownPoi, query)
    .filter((seed) => Number.isFinite(Number(seed.lat)) && Number.isFinite(Number(seed.lng)))
    .map((seed) => ({
      lat: Number(seed.lat),
      lng: Number(seed.lng),
      placeId: `poi:${knownPoi.id}:${normalizePoiText(seed.title)}:${normalizePoiText(seed.subtitle)}`,
      poiName: seed.title,
      osmClass: 'amenity',
      osmType: 'poi',
      formattedAddress: [seed.title, seed.subtitle, 'Salta'].filter(Boolean).join(', '),
      address: { city: 'Salta', road: seed.subtitle || '' },
    }));
}

function shouldSearchOsmPoi(query) {
  const text = String(query || '').trim();
  if (!text) return false;
  if (pickPrimaryHouseNumber(text) != null) return false;
  if (resolveSaltaKnownPoi(text) || looksLikeSaltaKnownPoi(text)) return true;

  ensureStreetCatalog();
  if (getCatalogAddressVariants(text, 1).length > 0) return false;

  return true;
}

function buildSearchQuery(address) {
  const text = String(address || '').trim();
  if (!text) return '';
  if (/salta/i.test(text)) return text;
  return `${text}, Salta, Argentina`;
}


function parseCoordinate(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapNominatimResult(item) {
  const lat = parseCoordinate(item?.lat);
  const lng = parseCoordinate(item?.lon);
  if (lat === null || lng === null) return null;

  const osmClass = String(item.class || item.category || '');
  const poiName = OSM_POI_CLASSES.has(osmClass)
    ? String(item.name || '').trim()
    : '';

  return {
    lat,
    lng,
    formattedAddress: String(item.display_name || '').trim(),
    placeId: item.place_id != null ? String(item.place_id) : null,
    importance: Number(item.importance) || 0,
    osmClass,
    osmType: String(item.type || ''),
    address: item.address || {},
    poiName: poiName || undefined,
  };
}

function scoreNominatimResult(result, query = '') {
  if (!result) return Number.NEGATIVE_INFINITY;

  let score = (Number(result.importance) || 0) * 40;
  const name = String(result.formattedAddress || '').toLowerCase();
  const q = String(query || '').toLowerCase();
  const addr = result.address || {};

  if (addr.house_number) score += 18;
  if (addr.road) score += 12;
  if (result.osmClass === 'building') score += 14;
  if (result.osmClass === 'amenity' || result.osmClass === 'shop') score += 10;
  if (result.osmType === 'house' || result.osmType === 'residential') score += 8;
  if (name.includes('salta')) score += 10;
  if (name.includes('argentina')) score += 4;
  if (/\d/.test(q) && !addr.house_number) score -= 8;
  if (VAGUE_OSM_TYPES.has(result.osmType)) score -= 25;

  return score;
}

function scoreCombinedCandidate(item, query) {
  const label = formatNominatimLabelForQuery(item, query);
  const semanticRaw = scoreCandidateAgainstQuery(item.formattedAddress, query);
  const semanticLabel = scoreCandidateAgainstQuery(label.full, query);
  const nominatim = scoreNominatimResult(item, query) / 100;
  return Math.max(semanticRaw, semanticLabel) + nominatim * 0.2;
}

function sortNominatimResults(results, query) {
  return [...results]
    .map((item) => ({ item, score: scoreCombinedCandidate(item, query) }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function nominatimHeaders() {
  return {
    Accept: 'application/json',
    'User-Agent': NOMINATIM_USER_AGENT,
  };
}

async function fetchNominatim(base, path, qs, signal) {
  return fetch(`${base}${path}?${qs}`, {
    headers: nominatimHeaders(),
    signal,
  });
}

async function nominatimFetch(path, params = {}) {
  requestChain = requestChain.then(async () => {
    const usePublic = path === '/search' && Date.now() < publicNominatimUntil;
    const minGap = usePublic ? 1100 : REQUEST_MIN_INTERVAL_MS;
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < minGap) {
      await sleep(minGap - elapsed);
    }

    const qs = new URLSearchParams({
      format: 'jsonv2',
      'accept-language': 'es',
      ...params,
    }).toString();

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS)
      : null;

    try {
      let response = await fetchNominatim(
        usePublic ? PUBLIC_NOMINATIM_BASE_URL : NOMINATIM_BASE_URL,
        path,
        qs,
        controller?.signal,
      );
      lastRequestAt = Date.now();

      if (!response.ok && !usePublic && path === '/search') {
        publicNominatimUntil = Date.now() + 2 * 60 * 1000;
        const since = Date.now() - lastRequestAt;
        if (since < 1100) await sleep(1100 - since);
        response = await fetchNominatim(PUBLIC_NOMINATIM_BASE_URL, path, qs, controller?.signal);
        lastRequestAt = Date.now();
      }

      if (!response.ok) {
        throw new Error(`Nominatim HTTP ${response.status}`);
      }

      return response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  });

  return requestChain;
}

async function fetchSearchResults(params) {
  const data = await nominatimFetch('/search', {
    addressdetails: '1',
    countrycodes: SALTA_COUNTRY,
    ...params,
  });

  return (Array.isArray(data) ? data : [])
    .map(mapNominatimResult)
    .filter(Boolean);
}

async function searchNominatimVariant(query, limit = 8) {
  try {
    const bounded = await fetchSearchResults({
      q: buildSearchQuery(query),
      limit: String(Math.max(1, Math.min(limit, 10))),
      viewbox: SALTA_VIEWBOX,
      bounded: '1',
    });

    if (bounded.length >= 2) return bounded;

    const relaxed = await fetchSearchResults({
      q: buildSearchQuery(query),
      limit: String(Math.max(1, Math.min(limit, 10))),
      viewbox: SALTA_VIEWBOX,
      bounded: '0',
    });

    const seen = new Set();
    const merged = [];
    for (const item of [...bounded, ...relaxed]) {
      const key = item.placeId || `${item.lat},${item.lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged;
  } catch {
    return [];
  }
}

async function searchNominatimPoi(query, limit = 8) {
  const text = String(query || '').trim();
  if (!text) return [];

  const searchQueries = buildPoiAutocompleteQueries(text).slice(0, 6);
  const merged = [];
  const seen = new Set();

  for (const q of searchQueries) {
    try {
      const hits = await searchNominatimVariant(q, limit);
      for (const hit of hits) {
        const key = hit.placeId || `${hit.lat.toFixed(5)},${hit.lng.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
          ...hit,
          osmType: OSM_POI_CLASSES.has(hit.osmClass) ? 'poi' : hit.osmType,
        });
      }
      if (merged.length >= limit) return merged;
    } catch {
      // ignorar query fallida
    }
  }

  return merged;
}

async function searchStructuredAddress(query) {
  const { street, houseNumber } = parseStreetHouseFromQuery(query);
  if (!street || street.length < 3) return [];

  const streetAttempts = houseNumber
    ? [`${houseNumber} ${street}`, `${street} ${houseNumber}`]
    : [street];

  const merged = [];
  const seen = new Set();

  for (const streetParam of streetAttempts) {
    try {
      const hits = await fetchSearchResults({
        street: streetParam,
        city: 'Salta',
        state: 'Salta',
        country: 'Argentina',
        limit: '8',
        viewbox: SALTA_VIEWBOX,
        bounded: '1',
      });
      for (const hit of hits) {
        const key = hit.placeId || `${hit.lat},${hit.lng}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(hit);
      }
    } catch {
      // intentar siguiente formato
    }
  }

  return merged;
}

async function geocodeCatalogCandidates(query) {
  ensureStreetCatalog();
  const variants = getCatalogAddressVariants(query, 8);
  if (variants.length <= 1) return [];

  const results = [];
  const seen = new Set();

  for (const variant of variants.slice(0, 6)) {
    try {
      const hits = await searchNominatimVariant(variant, 2);
      for (const hit of hits) {
        const key = hit.placeId || `${hit.lat},${hit.lng}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(hit);
      }
    } catch {
      // ignorar variante fallida
    }
  }

  return results;
}

async function runVariantsInBatches(variants, limit) {
  const merged = [];
  const seen = new Set();

  for (let i = 0; i < variants.length; i += PARALLEL_BATCH) {
    const batch = variants.slice(i, i + PARALLEL_BATCH);
    const batchResults = await Promise.all(
      batch.map((variant) => searchNominatimVariant(variant, limit).catch(() => [])),
    );

    for (const results of batchResults) {
      for (const item of results) {
        const key = item.placeId || `${item.lat},${item.lng}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }
  }

  return merged;
}

function formatShortAddress(displayName) {
  const label = formatNominatimDisplayLabel({ formattedAddress: displayName, address: {} });
  if (label.full) return label.full;
  const { title, subtitle } = formatAddressSuggestion(displayName);
  if (title && subtitle) return `${title}, ${subtitle}`;
  return title || displayName || '';
}

function toAutocompleteSuggestion(item, query, bonusScore = 0, titleOverride = null) {
  const label = formatNominatimLabelForQuery(item, query);
  const score = scoreCombinedCandidate(item, query) + bonusScore;
  const poiTitle = String(item.poiName || '').trim();
  const title = titleOverride || poiTitle || label.title;

  // Cuando hay un POI, la calle queda en label.title (que sería sobreescrito por poiTitle).
  // La incluimos en el subtítulo para no perder esa información, igual que Google Maps.
  // Ejemplo: poiTitle="Shopping Salta", label.title="Ruta Nac. 50", label.subtitle="Bº El Pilar, Salta"
  // → subtitle = "Ruta Nac. 50, Bº El Pilar, Salta"
  const subtitleText = String(label.subtitle || '').trim();
  const titleText = String(label.title || '').trim();
  const subtitleStartsWithTitle = Boolean(
    subtitleText
    && titleText
    && subtitleText.toLowerCase().startsWith(titleText.toLowerCase()),
  );
  const enrichedSubtitle = (poiTitle && titleText && titleText !== poiTitle)
    ? (subtitleStartsWithTitle ? subtitleText : [titleText, subtitleText].filter(Boolean).join(', '))
    : subtitleText;

  const address = titleOverride
    ? (enrichedSubtitle ? `${titleOverride}, ${enrichedSubtitle}` : titleOverride)
    : (poiTitle && enrichedSubtitle
      ? `${poiTitle}, ${enrichedSubtitle}`
      : (label.full || item.formattedAddress));
  return {
    address,
    placeId: item.placeId,
    lat: item.lat,
    lng: item.lng,
    title,
    subtitle: enrichedSubtitle,
    sessionToken: item.sessionToken || null,
    score,
    ...(item.byDistance ? { distanceMeters: item.distanceMeters, byDistance: true } : {}),
  };
}

async function geocodeAddressGoogleViaAutocomplete(query, options = {}) {
  const { createSessionToken } = require('./googlePlaces');
  const sessionToken = options.sessionToken || createSessionToken();
  const suggestions = await autocompleteAddressSalta(query, 5, { sessionToken });

  for (const hit of suggestions) {
    if (Number.isFinite(hit?.lat) && Number.isFinite(hit?.lng)) {
      return {
        lat: hit.lat,
        lng: hit.lng,
        formattedAddress: hit.address,
        placeId: hit.placeId || null,
        geocodeSource: null,
      };
    }

    if (!isGooglePlaceId(hit?.placeId)) continue;

    try {
      const details = await getGooglePlaceDetails(hit.placeId, {
        sessionToken: hit.sessionToken || sessionToken,
        formattedAddress: hit.address,
        title: hit.title,
        subtitle: hit.subtitle,
      });
      return {
        lat: details.lat,
        lng: details.lng,
        formattedAddress: details.formattedAddress || hit.address,
        placeId: details.placeId || hit.placeId,
        geocodeSource: details.geocodeSource || 'google_place_details_essentials',
      };
    } catch {
      // Probar la siguiente sugerencia del autocomplete.
    }
  }

  throw new Error('No se encontró la dirección');
}

async function geocodeAddress(address, options = {}) {
  const query = String(address || '').trim();
  if (!query) throw new Error('Dirección vacía');

  if (GOOGLE_POI_AUTOCOMPLETE_ENABLED && isGoogleConfigured()) {
    const official = await findOfficialHouseNumber(query);
    if (official) {
      const label = formatNominatimLabelForQuery(official, query);
      return {
        lat: official.lat,
        lng: official.lng,
        formattedAddress: label.full || official.formattedAddress,
        placeId: official.placeId || null,
        geocodeSource: 'georef',
      };
    }
    return geocodeAddressGoogleViaAutocomplete(query, options);
  }

  const hasHouseNumber = pickPrimaryHouseNumber(query) != null;
  if (hasHouseNumber) {
    const georefHits = await searchGeorefAddress(query, 4).catch(() => []);
    const ranked = preferSpecificRoad(query, georefHits.filter((hit) => georefHitMatchesStreetQuery(hit, query)));
    if (ranked.length > 0) {
      const best = pickOfficialHouseNumber(ranked) || ranked[0];
      const label = formatNominatimLabelForQuery(best, query);
      return {
        lat: best.lat,
        lng: best.lng,
        formattedAddress: label.full || best.formattedAddress,
        placeId: best.placeId || null,
        geocodeSource: 'georef',
      };
    }
  }

  const [structuredHits, variantHits] = await Promise.all([
    searchStructuredAddress(query),
    runVariantsInBatches(buildAddressSearchQueries(query).slice(0, 6), 8),
  ]);

  const results = sortNominatimResults([...structuredHits, ...variantHits], query);
  if (results.length === 0) {
    throw new Error('No se encontró la dirección');
  }

  const best = results[0];
  const label = formatNominatimLabelForQuery(best, query);
  return {
    lat: best.lat,
    lng: best.lng,
    formattedAddress: label.full || best.formattedAddress,
  };
}

async function geocodeAddressMultiple(address, limit = 5) {
  const query = String(address || '').trim();
  if (!query) throw new Error('Dirección vacía');

  const suggestions = await autocompleteAddressSalta(query, Math.max(limit, 5));
  if (suggestions.length === 0) {
    throw new Error('No se encontró la dirección');
  }

  const results = [];
  for (const item of suggestions.slice(0, limit)) {
    if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
      results.push({
        lat: item.lat,
        lng: item.lng,
        formattedAddress: item.address,
      });
      continue;
    }
    const details = await getPlaceDetails(item.placeId, {
      sessionToken: item.sessionToken,
      formattedAddress: item.address,
      title: item.title,
      subtitle: item.subtitle,
    });
    results.push({
      lat: details.lat,
      lng: details.lng,
      formattedAddress: details.formattedAddress || item.address,
    });
  }
  return results;
}

function isCoordinateLikeAddress(text) {
  return /^-?\d+\.\d{4,},\s*-?\d+\.\d{4,}$/.test(String(text || '').trim());
}

function formatReverseGeocodeResult(data) {
  const mapped = mapNominatimResult(data);
  if (!mapped) return null;
  const label = formatNominatimDisplayLabel(mapped);
  const formatted = String(label.full || label.title || '').trim();
  if (!formatted || isCoordinateLikeAddress(formatted)) return null;
  return formatted;
}

async function publicNominatimReverseFetch(lat, lng) {
  const qs = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    addressdetails: '1',
    zoom: '18',
    'accept-language': 'es',
  });

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS)
    : null;

  try {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_MIN_INTERVAL_MS) {
      await sleep(REQUEST_MIN_INTERVAL_MS - elapsed);
    }

    const response = await fetch(`${PUBLIC_NOMINATIM_BASE_URL}/reverse?${qs.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT,
      },
      signal: controller?.signal,
    });

    lastRequestAt = Date.now();

    if (!response.ok) {
      throw new Error(`Nominatim público HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function reverseGeocode(lat, lng) {
  const fallback = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return fallback;

  // 1) Nominatim self-hosted (Railway)
  try {
    const data = await nominatimFetch('/reverse', {
      lat: String(parsedLat),
      lon: String(parsedLng),
      addressdetails: '1',
      zoom: '18',
    });
    const formatted = formatReverseGeocodeResult(data);
    if (formatted) return formatted;
  } catch {
    // continuar con fallbacks
  }

  // 2) TomTom reverse (si hay clave en servidor)
  try {
    const tomtomHit = await tomtomReverseGeocode(parsedLat, parsedLng);
    if (tomtomHit) {
      const label = formatNominatimDisplayLabel(tomtomHit);
      const formatted = String(label.full || label.title || tomtomHit.formattedAddress || '').trim();
      if (formatted && !isCoordinateLikeAddress(formatted)) return formatted;
    }
  } catch {
    // continuar
  }

  // 3) Nominatim público (cuando el self-hosted está caído o sin datos)
  try {
    const data = await publicNominatimReverseFetch(parsedLat, parsedLng);
    const formatted = formatReverseGeocodeResult(data);
    if (formatted) return formatted;
  } catch {
    // último recurso: coordenadas
  }

  return fallback;
}

function collectAutocompleteCandidates(items, query, merged, seenPlaceIds, seenCoords, seenLabels, bonusScore = 0, titleOverride = null, dedupeByLabel = true) {
  for (const item of items) {
    const placeId = item?.placeId
      || (Number.isFinite(item?.lat) && Number.isFinite(item?.lng)
        ? `coord:${item.lat.toFixed(6)},${item.lng.toFixed(6)}`
        : null);
    if (!placeId) continue;
    if (VAGUE_OSM_TYPES.has(item.osmType) && !item.address?.house_number && !item.address?.road && !item.poiName) {
      continue;
    }
    if (
      titleOverride
      && !item.poiName
      && item.osmType !== 'poi'
      && !OSM_POI_CLASSES.has(item.osmClass)
      && !['hospital', 'clinic', 'university', 'mall', 'marketplace', 'museum', 'stadium', 'bus_station', 'aerodrome'].includes(item.osmType)
    ) {
      continue;
    }
    const hasCoords = Number.isFinite(item?.lat) && Number.isFinite(item?.lng);
    if (hasCoords && !coordsAllowedForQuery(item.lat, item.lng, query)) continue;

    const coordKey = hasCoords
      ? `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`
      : `id:${placeId}`;
    if (seenPlaceIds.has(placeId) || seenCoords.has(coordKey)) continue;

    const poiBonus = (item.poiName || item.osmType === 'poi') ? 0.2 : 0;
    const suggestion = toAutocompleteSuggestion({ ...item, placeId }, query, bonusScore + poiBonus, titleOverride);
    if (suggestion.score < MIN_AUTOCOMPLETE_SCORE) continue;
    // Descartar resultados con título demasiado corto (ruido de OSM como "A", "B", etc.)
    if (suggestion.title && suggestion.title.length <= 2 && !suggestion.title.match(/^\d/)) continue;

    const labelKey = normalizePoiText(suggestion.address);
    if (dedupeByLabel && labelKey && seenLabels.has(labelKey)) continue;

    seenPlaceIds.add(placeId);
    seenCoords.add(coordKey);
    if (labelKey) seenLabels.add(labelKey);
    merged.push(suggestion);
  }
}

function foldStreetText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function roadTokenOverlap(query, road) {
  const q = foldStreetText(query);
  const tokens = foldStreetText(road).split(/\s+/).filter((token) => token.length >= 3);
  return tokens.filter((token) => q.includes(token)).length;
}

/** Si hay homónimas, se queda la calle cuyo nombre comparte más palabras con la consulta. */
function preferSpecificRoad(query, matches) {
  if (!matches || matches.length < 2) return matches || [];
  const scored = matches.map((hit) => ({
    hit,
    score: roadTokenOverlap(query, hit?.address?.road),
  }));
  const best = Math.max(...scored.map((item) => item.score));
  if (best <= 0) return matches;
  return scored.filter((item) => item.score === best).map((item) => item.hit);
}

function roadAppearsInQuery(query, road) {
  const q = foldStreetText(query);
  const tokens = foldStreetText(road)
    .replace(/\b(avenida|av|calle|pasaje|pje)\b/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
  if (!tokens.length) return false;
  const hits = tokens.filter((token) => q.includes(token));
  return hits.length >= Math.min(2, tokens.length) || hits.some((token) => token.length >= 5);
}

function georefHitMatchesStreetQuery(hit, query) {
  const wanted = pickPrimaryHouseNumber(query);
  const got = Number(hit?.address?.house_number);
  if (wanted == null || !Number.isFinite(got) || got !== wanted) return false;
  if (!coordsAllowedForQuery(hit.lat, hit.lng, query)) return false;
  return roadAppearsInQuery(query, hit?.address?.road);
}

/** Georef tiene calles homónimas con la misma altura (calle Alvarado y Pje. Ministro Alvarado, a 1 km). */
const HOMONYM_STREET_METERS = 250;

function metersBetween(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Con homónimas solo vale la que está junto a `near`; sin referencia no se adivina. */
function pickOfficialHouseNumber(matches, near = null) {
  const first = matches[0];
  if (!first) return null;
  if (!matches.some((hit) => metersBetween(hit, first) > HOMONYM_STREET_METERS)) return first;

  const point = { lat: Number(near?.lat), lng: Number(near?.lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  const nearest = matches.reduce((best, hit) => (
    metersBetween(hit, point) < metersBetween(best, point) ? hit : best
  ));
  return metersBetween(nearest, point) <= HOMONYM_STREET_METERS ? nearest : null;
}

async function findOfficialHouseNumber(query, near = null) {
  const text = String(query || '').trim();
  if (pickPrimaryHouseNumber(text) == null) return null;
  if (looksLikeSaltaKnownPoi(text)) return null;
  const hits = await searchGeorefAddress(text, 4).catch(() => []);
  const matches = preferSpecificRoad(text, hits.filter((hit) => georefHitMatchesStreetQuery(hit, text)));
  return pickOfficialHouseNumber(matches, near);
}

function streetHouseQueryFromPlace(options = {}) {
  const title = String(options.title || '').trim();
  const head = String(options.formattedAddress || '').split(',')[0].trim();
  for (const text of [title, head]) {
    if (pickPrimaryHouseNumber(text) == null) continue;
    if (looksLikeSaltaKnownPoi(text)) continue;
    return text;
  }
  return null;
}

function collectGeorefCandidates(items, query, merged, seenPlaceIds, seenCoords) {
  for (const item of items) {
    if (!item?.placeId) continue;
    if (!coordsAllowedForQuery(item.lat, item.lng, query)) continue;

    const coordKey = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
    if (seenPlaceIds.has(item.placeId) || seenCoords.has(coordKey)) continue;

    const label = formatNominatimLabelForQuery(item, query);
    const semantic = scoreCandidateAgainstQuery(label.full, query);
    const suggestion = {
      address: label.full || item.formattedAddress,
      placeId: item.placeId,
      lat: item.lat,
      lng: item.lng,
      title: label.title,
      subtitle: label.subtitle,
      score: GEOREF_AUTOCOMPLETE_BONUS + semantic * 0.08,
    };

    seenPlaceIds.add(item.placeId);
    seenCoords.add(coordKey);
    merged.push(suggestion);
  }
}

const streetPointCache = new Map();

function bareGeorefStreetName(nombre) {
  return foldStreetText(nombre)
    .replace(/^(pje|psje|pasaje|av|avda|avenida|calle|diag|diagonal)\s+/, '')
    .trim();
}

function streetCacheKey(street) {
  return `${street.type}|${street.nameKey}`;
}

async function locateCatalogStreet(street) {
  const key = streetCacheKey(street);
  if (streetPointCache.has(key)) return streetPointCache.get(key);

  const calles = await fetchGeorefCalles(street.name, { max: 8 });
  const wanted = foldStreetText(street.name);
  const calle = calles.find((item) => {
    const name = bareGeorefStreetName(item?.nombre);
    const category = foldStreetText(item?.categoria);
    const typeOk = !category
      || category.includes(street.type === 'pasaje' ? 'pasaje' : street.type === 'avenida' ? 'avenida' : 'calle');
    return typeOk && name === wanted;
  });
  if (!calle) return null;

  const height = Number(calle?.altura?.inicio?.izquierda || calle?.altura?.inicio?.derecha || 0);
  const hits = await searchGeorefAddress(`${calle.nombre} ${height > 0 ? height : 1}`, 2);
  const point = hits[0] || null;
  if (point) streetPointCache.set(key, point);
  return point;
}

async function locateStreetTitle(title) {
  const [street] = searchStreetCatalog(title, 1);
  if (!street) return null;
  return locateCatalogStreet(street);
}

function streetSuggestion(street, point) {
  const title = street.fullLabel;
  const suggestion = {
    address: `${title}, Salta`,
    title,
    subtitle: 'Salta',
    placeId: `street:${encodeURIComponent(title)}`,
  };
  if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng)) {
    suggestion.lat = point.lat;
    suggestion.lng = point.lng;
    if (point.placeId) suggestion.placeId = point.placeId;
  }
  return suggestion;
}

/** Calles y pasajes del padrón. El punto se resuelve al elegir, sin esperar al mapa. */
function suggestionsForStreetCatalog(query, limit) {
  return searchStreetCatalog(query, limit).map((street) => (
    streetSuggestion(street, streetPointCache.get(streetCacheKey(street)) || null)
  ));
}

async function autocompleteAddressSalta(query, limit = 8, options = {}) {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) return [];

  try {
    // Autocomplete exclusivo vía Google Places (New) + Place Details Essentials al elegir.
    if (GOOGLE_POI_AUTOCOMPLETE_ENABLED && isGoogleConfigured()) {
      const expand = options?.expand === true;
      const googleHits = await googleSearchPoi(trimmed, Math.max(limit + 4, 12), {
        sessionToken: options?.sessionToken,
        expand,
        near: options?.near,
      }).catch(() => []);

      const merged = [];
      const seenPlaceIds = new Set();
      const seenCoords = new Set();
      const seenLabels = new Set();

      // En búsqueda ampliada, dos sucursales con igual rótulo (misma avenida) son
      // lugares distintos: no se descartan por rótulo repetido.
      collectAutocompleteCandidates(
        googleHits,
        trimmed,
        merged,
        seenPlaceIds,
        seenCoords,
        seenLabels,
        2.1,
        null,
        !expand,
      );

      const hasHouseNumber = pickPrimaryHouseNumber(trimmed) != null;
      if (hasHouseNumber && !expand) {
        const georefHits = await searchGeorefAddress(trimmed, 4).catch(() => []);
        const official = georefHits.filter((hit) => georefHitMatchesStreetQuery(hit, trimmed));
        const best = pickOfficialHouseNumber(official);
        // Homónimas: Google ya nombra cada una ("Pje. Ministro Alvarado 69") y al elegirla
        // getPlaceDetails toma la oficial más cercana. Filas Georef iguales solo confunden.
        if (best || merged.length === 0) {
          collectGeorefCandidates(official, trimmed, merged, seenPlaceIds, seenCoords);
        }
        if (best) {
          for (const item of merged) {
            if (String(item.placeId || '').startsWith('georef:')) continue;
            const blob = `${item.title || ''} ${item.address || ''}`;
            if (pickPrimaryHouseNumber(blob) !== pickPrimaryHouseNumber(trimmed)) continue;
            if (!roadAppearsInQuery(blob, best.address?.road)) continue;
            item.lat = best.lat;
            item.lng = best.lng;
          }
        }
      }

      // Búsqueda ampliada con ubicación conocida: sucursales de la más cercana a la más lejana.
      const byDistance = !hasHouseNumber && merged.length > 0 && merged.every((item) => item.byDistance);
      merged.sort(byDistance
        ? (a, b) => a.distanceMeters - b.distanceMeters
        : (a, b) => b.score - a.score);
      if (hasHouseNumber) {
        merged.sort((a, b) => {
          const aGeoref = String(a.placeId || '').startsWith('georef:');
          const bGeoref = String(b.placeId || '').startsWith('georef:');
          if (aGeoref && !bGeoref) return -1;
          if (!aGeoref && bGeoref) return 1;
          return 0;
        });
      }
      return merged.slice(0, limit).map(({ score, byDistance: _byDistance, ...item }) => item);
    }

    const searchQueries = buildAddressSearchQueries(trimmed).slice(0, MAX_AUTOCOMPLETE_VARIANTS);
    const knownPoi = resolveSaltaKnownPoi(trimmed);
    const hasHouseNumber = pickPrimaryHouseNumber(trimmed) != null;
    const useOsmPoi = shouldSearchOsmPoi(trimmed);
    // Fallback legacy sin Google: Nominatim/Georef/TomTom.
    const forcePoiSearch = !hasHouseNumber && trimmed.length >= 4;
    ensureStreetCatalog();
    const catalogVariantCount = getCatalogAddressVariants(trimmed, 8).length;

    const primaryQuery = useOsmPoi
      ? (knownPoi?.geocodeQuery || buildPoiAutocompleteQueries(trimmed)[0] || trimmed)
      : (searchQueries[0] || trimmed);
    const knownPoiTitleOverride = (knownPoi && knownPoi.id !== 'shopping')
      ? (knownPoi.label || null)
      : null;

    const merged = [];
    const seenPlaceIds = new Set();
    const seenCoords = new Set();
    const seenLabels = new Set();

    // Fast-path: calle + altura (caso más común en despacho) con mínimo costo/latencia.
    if (hasHouseNumber) {
      const georefHits = await searchGeorefAddress(trimmed, 4).catch(() => []);
      const matchingGeoref = preferSpecificRoad(
        trimmed,
        georefHits.filter((hit) => georefHitMatchesStreetQuery(hit, trimmed)),
      );
      collectGeorefCandidates(matchingGeoref, trimmed, merged, seenPlaceIds, seenCoords);
      if (merged.length > 0) {
        return merged.slice(0, limit).map(({ score, ...item }) => item);
      }

      const [structuredHits, geocodeHits] = await Promise.all([
        withTimeout(searchStructuredAddress(trimmed).catch(() => []), 2000, []),
        withTimeout(
          searchNominatimVariant(buildSearchQuery(trimmed), Math.max(limit, 6)).catch(() => []),
          2000,
          [],
        ),
      ]);

      collectAutocompleteCandidates(
        structuredHits,
        trimmed,
        merged,
        seenPlaceIds,
        seenCoords,
        seenLabels,
        0.28,
      );
      collectAutocompleteCandidates(
        geocodeHits,
        trimmed,
        merged,
        seenPlaceIds,
        seenCoords,
        seenLabels,
        0.22,
      );

      merged.sort((a, b) => {
        const aGeoref = String(a.placeId || '').startsWith('georef:');
        const bGeoref = String(b.placeId || '').startsWith('georef:');
        if (aGeoref && !bGeoref) return -1;
        if (!aGeoref && bGeoref) return 1;
        return b.score - a.score;
      });

      return merged.slice(0, limit).map(({ score, ...item }) => item);
    }

    if (knownPoi?.pollSeeds?.length) {
      collectAutocompleteCandidates(
        suggestionsFromKnownPoiSeeds(knownPoi, trimmed),
        trimmed,
        merged,
        seenPlaceIds,
        seenCoords,
        seenLabels,
        2.4,
      );
      if (merged.length > 0) {
        merged.sort((a, b) => b.score - a.score);
        return merged.slice(0, limit).map(({ score, ...item }) => item);
      }
    }

    if (!hasHouseNumber) {
      const streetHits = await suggestionsForStreetCatalog(trimmed, limit);
      if (streetHits.length > 0) return streetHits;
    }

    // Legacy sin Google: POIs y calles vía Nominatim/Georef.
    const [primaryHits, structuredHits, georefHits, poiHits, geocodeHits] = await Promise.all([
      searchNominatimVariant(primaryQuery, limit).catch(() => []),
      Promise.resolve([]),
      Promise.resolve([]),
      (useOsmPoi || forcePoiSearch)
        ? searchNominatimPoi(trimmed, Math.max(limit + 2, 8)).catch(() => [])
        : Promise.resolve([]),
      Promise.resolve([]),
    ]);

    // ── 2. Georef (precisión para direcciones con número de calle) ─────────
    collectGeorefCandidates(georefHits, trimmed, merged, seenPlaceIds, seenCoords);

    // ── 3. Nominatim (complementario / fallback) ───────────────────────────
    collectAutocompleteCandidates(
      structuredHits,
      trimmed,
      merged,
      seenPlaceIds,
      seenCoords,
      seenLabels,
      hasHouseNumber ? 0.22 : 0,
    );
    collectAutocompleteCandidates(
      primaryHits,
      trimmed,
      merged,
      seenPlaceIds,
      seenCoords,
      seenLabels,
      knownPoi ? 0.55 : 0.12,
      knownPoiTitleOverride,
    );
    collectAutocompleteCandidates(
      poiHits,
      trimmed,
      merged,
      seenPlaceIds,
      seenCoords,
      seenLabels,
      hasHouseNumber ? 0.18 : (useOsmPoi ? 0.35 : 0.24),
    );
    collectAutocompleteCandidates(
      geocodeHits,
      trimmed,
      merged,
      seenPlaceIds,
      seenCoords,
      seenLabels,
      hasHouseNumber ? 0.28 : 0,
    );

    if (merged.length < limit && searchQueries.length > 1 && !useOsmPoi) {
      const extraHits = await runVariantsInBatches(searchQueries.slice(1, 4), limit);
      collectAutocompleteCandidates(extraHits, trimmed, merged, seenPlaceIds, seenCoords, seenLabels, 0);
    }

    if (merged.length < limit && knownPoi) {
      const poiQueries = getKnownPoiSearchQueries(knownPoi).slice(0, 3);
      const poiBatches = await Promise.all(
        poiQueries.map(async (q) => {
          const variantHits = await searchNominatimVariant(q, 4).catch(() => []);
          return variantHits;
        }),
      );
      collectAutocompleteCandidates(
        poiBatches.flat(),
        trimmed,
        merged,
        seenPlaceIds,
        seenCoords,
        seenLabels,
        0.52,
        knownPoiTitleOverride,
      );
    }

    // Fallback TomTom: último recurso, solo si Nominatim Y Google Places
    // no encontraron suficientes resultados para una búsqueda de lugar.
    if (useOsmPoi && !hasHouseNumber && merged.length < 2) {
      const tomtomHits = await searchTomTomPoiFallback(trimmed, Math.max(limit, 6)).catch(() => []);
      collectAutocompleteCandidates(
        tomtomHits,
        trimmed,
        merged,
        seenPlaceIds,
        seenCoords,
        seenLabels,
        0.38,
      );
    }

    if (merged.length < limit && catalogVariantCount > 1 && !useOsmPoi) {
      const catalogHits = await geocodeCatalogCandidates(trimmed);
      collectAutocompleteCandidates(catalogHits, trimmed, merged, seenPlaceIds, seenCoords, seenLabels, 0.15);
    }

    merged.sort((a, b) => b.score - a.score);

    if (hasHouseNumber && georefHits.length > 0) {
      merged.sort((a, b) => {
        const aGeoref = String(a.placeId || '').startsWith('georef:');
        const bGeoref = String(b.placeId || '').startsWith('georef:');
        if (aGeoref && !bGeoref) return -1;
        if (!aGeoref && bGeoref) return 1;
        return b.score - a.score;
      });
    }

    return merged.slice(0, limit).map(({ score, ...item }) => item);
  } catch {
    return [];
  }
}

async function getPlaceDetails(placeId, options = {}) {
  const id = String(placeId || '').trim();
  if (!id) throw new Error('place_id inválido');

  if (isGooglePlaceId(id)) {
    const details = await getGooglePlaceDetails(id, {
      sessionToken: options?.sessionToken,
      formattedAddress: options?.formattedAddress,
      title: options?.title,
      subtitle: options?.subtitle,
    });
    const streetQuery = streetHouseQueryFromPlace(options);
    const official = streetQuery ? await findOfficialHouseNumber(streetQuery, details) : null;
    if (!official) return details;
    return {
      ...details,
      lat: official.lat,
      lng: official.lng,
      geocodeSource: 'georef',
    };
  }

  if (id.startsWith('georef:')) {
    const mapped = await resolveGeorefPlaceId(id);
    if (!mapped) {
      throw new Error('No se pudo obtener detalles del lugar');
    }
    const label = formatNominatimDisplayLabel(mapped);
    return {
      lat: mapped.lat,
      lng: mapped.lng,
      formattedAddress: label.full || mapped.formattedAddress,
      placeId: id,
      geocodeSource: 'georef',
    };
  }

  if (id.startsWith('street:')) {
    const title = decodeURIComponent(id.slice('street:'.length));
    const point = await locateStreetTitle(title);
    if (!point) throw new Error('No se pudo obtener detalles del lugar');
    const label = formatNominatimLabelForQuery(point, title);
    return {
      lat: point.lat,
      lng: point.lng,
      formattedAddress: label.full || point.formattedAddress,
      placeId: point.placeId || id,
      geocodeSource: 'georef',
      title,
      subtitle: 'Salta',
    };
  }

  if (id.startsWith('coord:')) {
    const [latRaw, lngRaw] = id.slice(6).split(',');
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('No se pudo obtener detalles del lugar');
    }
    return { lat, lng, formattedAddress: await reverseGeocode(lat, lng) };
  }

  if (GOOGLE_POI_AUTOCOMPLETE_ENABLED && isGoogleConfigured()) {
    throw new Error('Se requiere un placeId de Google Places (google:...)');
  }

  const data = await nominatimFetch('/lookup', {
    place_ids: id,
    addressdetails: '1',
  });

  const item = Array.isArray(data) ? data[0] : null;
  const mapped = mapNominatimResult(item);
  if (!mapped) {
    throw new Error('No se pudo obtener detalles del lugar');
  }

  const label = formatNominatimDisplayLabel(mapped);
  return {
    lat: mapped.lat,
    lng: mapped.lng,
    formattedAddress: label.full || mapped.formattedAddress,
  };
}

module.exports = {
  geocodeAddress,
  geocodeAddressMultiple,
  reverseGeocode,
  autocompleteAddressSalta,
  getPlaceDetails,
  buildSearchQuery,
  mapNominatimResult,
  sortNominatimResults,
  scoreCombinedCandidate,
};
