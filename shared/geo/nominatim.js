const {
  NOMINATIM_BASE_URL,
  NOMINATIM_USER_AGENT,
  NOMINATIM_SELF_HOSTED,
  SALTA_VIEWBOX,
  SALTA_COUNTRY,
  isWithinSaltaCapital,
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
} = require('../salta-address');

const {
  resolveSaltaKnownPoi,
  getKnownPoiSearchQueries,
  looksLikeSaltaKnownPoi,
  buildPoiAutocompleteQueries,
  normalizePoiText,
} = require('../salta-known-pois');
const { searchGeorefAddress, resolveGeorefPlaceId } = require('./georef');

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

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
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

  const osmClass = String(item.class || '');
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

async function nominatimFetch(path, params = {}) {
  requestChain = requestChain.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_MIN_INTERVAL_MS) {
      await sleep(REQUEST_MIN_INTERVAL_MS - elapsed);
    }

    const qs = new URLSearchParams({
      format: 'jsonv2',
      'accept-language': 'es',
      ...params,
    });

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(`${NOMINATIM_BASE_URL}${path}?${qs.toString()}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': NOMINATIM_USER_AGENT,
        },
        signal: controller?.signal,
      });

      lastRequestAt = Date.now();

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
  const address = titleOverride
    ? (label.subtitle ? `${titleOverride}, ${label.subtitle}` : titleOverride)
    : (poiTitle && label.subtitle
      ? `${poiTitle}, ${label.subtitle}`
      : (label.full || item.formattedAddress));
  return {
    address,
    placeId: item.placeId,
    lat: item.lat,
    lng: item.lng,
    title,
    subtitle: label.subtitle,
    score,
  };
}

async function geocodeAddress(address) {
  const query = String(address || '').trim();
  if (!query) throw new Error('Dirección vacía');

  const hasHouseNumber = pickPrimaryHouseNumber(query) != null;
  if (hasHouseNumber) {
    const georefHits = await searchGeorefAddress(query, 1).catch(() => []);
    if (georefHits.length > 0) {
      const best = georefHits[0];
      const label = formatNominatimLabelForQuery(best, query);
      return {
        lat: best.lat,
        lng: best.lng,
        formattedAddress: label.full || best.formattedAddress,
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

  return suggestions.slice(0, limit).map((item) => ({
    lat: item.lat,
    lng: item.lng,
    formattedAddress: item.address,
  }));
}

async function reverseGeocode(lat, lng) {
  const fallback = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;

  try {
    const data = await nominatimFetch('/reverse', {
      lat: String(lat),
      lon: String(lng),
      addressdetails: '1',
      zoom: '18',
    });

    const mapped = mapNominatimResult(data);
    if (!mapped) return fallback;
    const label = formatNominatimDisplayLabel(mapped);
    return label.full || label.title || fallback;
  } catch {
    return fallback;
  }
}

function collectAutocompleteCandidates(items, query, merged, seenPlaceIds, seenCoords, seenLabels, bonusScore = 0, titleOverride = null) {
  for (const item of items) {
    const placeId = item?.placeId
      || (Number.isFinite(item?.lat) && Number.isFinite(item?.lng)
        ? `coord:${item.lat.toFixed(6)},${item.lng.toFixed(6)}`
        : null);
    if (!placeId) continue;
    if (VAGUE_OSM_TYPES.has(item.osmType) && !item.address?.house_number && !item.address?.road && !item.poiName) {
      continue;
    }
    if (!isWithinSaltaCapital(item.lat, item.lng)) continue;

    const coordKey = `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`;
    if (seenPlaceIds.has(placeId) || seenCoords.has(coordKey)) continue;

    const poiBonus = (item.poiName || item.osmType === 'poi') ? 0.2 : 0;
    const suggestion = toAutocompleteSuggestion({ ...item, placeId }, query, bonusScore + poiBonus, titleOverride);
    if (suggestion.score < MIN_AUTOCOMPLETE_SCORE) continue;

    const labelKey = normalizePoiText(suggestion.address);
    if (labelKey && seenLabels.has(labelKey)) continue;

    seenPlaceIds.add(placeId);
    seenCoords.add(coordKey);
    if (labelKey) seenLabels.add(labelKey);
    merged.push(suggestion);
  }
}

function collectGeorefCandidates(items, query, merged, seenPlaceIds, seenCoords) {
  for (const item of items) {
    if (!item?.placeId) continue;
    if (!isWithinSaltaCapital(item.lat, item.lng)) continue;

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

async function autocompleteAddressSalta(query, limit = 8) {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 3) return [];

  try {
    const searchQueries = buildAddressSearchQueries(trimmed).slice(0, MAX_AUTOCOMPLETE_VARIANTS);
    const knownPoi = resolveSaltaKnownPoi(trimmed);
    const hasHouseNumber = pickPrimaryHouseNumber(trimmed) != null;
    const useOsmPoi = shouldSearchOsmPoi(trimmed);
    ensureStreetCatalog();
    const catalogVariantCount = getCatalogAddressVariants(trimmed, 8).length;

    const primaryQuery = useOsmPoi
      ? (knownPoi?.geocodeQuery || buildPoiAutocompleteQueries(trimmed)[0] || trimmed)
      : (searchQueries[0] || trimmed);
    const [primaryHits, structuredHits, georefHits, poiHits, geocodeHits] = await Promise.all([
      searchNominatimVariant(primaryQuery, limit).catch(() => []),
      hasHouseNumber
        ? searchStructuredAddress(trimmed).catch(() => [])
        : Promise.resolve([]),
      hasHouseNumber ? searchGeorefAddress(trimmed, 3).catch(() => []) : Promise.resolve([]),
      useOsmPoi ? searchNominatimPoi(trimmed, Math.max(limit, 6)).catch(() => []) : Promise.resolve([]),
      hasHouseNumber
        ? searchNominatimVariant(buildSearchQuery(trimmed), Math.max(limit, 6)).catch(() => [])
        : Promise.resolve([]),
    ]);

    const merged = [];
    const seenPlaceIds = new Set();
    const seenCoords = new Set();
    const seenLabels = new Set();

    collectGeorefCandidates(georefHits, trimmed, merged, seenPlaceIds, seenCoords);
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
      knownPoi?.label || null,
    );
    collectAutocompleteCandidates(
      poiHits,
      trimmed,
      merged,
      seenPlaceIds,
      seenCoords,
      seenLabels,
      hasHouseNumber ? 0.18 : 0.35,
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
      const poiQueries = getKnownPoiSearchQueries(knownPoi).slice(0, 1);
      const poiBatches = await Promise.all(
        poiQueries.map((q) => searchNominatimPoi(q, 3).catch(() => [])),
      );
      collectAutocompleteCandidates(
        poiBatches.flat(),
        trimmed,
        merged,
        seenPlaceIds,
        seenCoords,
        seenLabels,
        0.45,
        knownPoi.label || null,
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

async function getPlaceDetails(placeId) {
  const id = String(placeId || '').trim();
  if (!id) throw new Error('place_id inválido');

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
