/**
 * Resolución server-side de sugerencias de autocomplete — misma lógica que
 * AddressAutocomplete + GET /api/geo/geocode (Place Details Essentials + caché Supabase).
 */
import {
  autocompleteAddressSalta,
  getPlaceDetails,
  searchGooglePlacesLastResort,
  SALTA_CENTER_LAT,
  SALTA_CENTER_LNG,
} from './index.js';
import { searchCachedPlaces } from '../googlePlacesBudgetStore.js';
import { findPinnedAddress, pinnedAddressSuggestion } from '../../../shared/pinned-addresses.js';
import { findSavedPinnedAddresses } from '../savedPinnedAddresses.js';
import {
  isGoogleConfigured,
  isGooglePlaceId,
  createSessionToken,
} from '../../../shared/geo/googlePlaces.js';
import {
  scoreCandidateAgainstQuery,
  isVagueLocalityAddress,
  formatIntersectionLabelFromQuery,
  pickPrimaryHouseNumber,
} from '../../../shared/salta-address.js';

function firstAddressLine(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.split(',')[0]?.trim() || '';
}

function neighborMunicipalityPenalty(hit) {
  const blob = `${hit?.subtitle || ''} ${String(hit?.formattedAddress || '').split(',').slice(1).join(' ')}`;
  return /\b(jujuy|tartagal|oran|orán|metan|metán|rosario de la frontera|embarcacion|embarcación)\b/i.test(blob)
    ? 1
    : 0;
}

function needsGoogleCoverage(results, query) {
  const text = String(query || '').trim();
  if (text.length < 4) return false;
  const number = pickPrimaryHouseNumber(text);
  if (number == null) return true;
  return !(results || []).some((item) => (
    Number.isFinite(Number(item?.lat))
    && Number.isFinite(Number(item?.lng))
    && String(item?.placeId || '').startsWith('georef:')
  ));
}

function distanceToSaltaCenterKm(hit) {
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Number.POSITIVE_INFINITY;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat - SALTA_CENTER_LAT);
  const dLng = toRad(lng - SALTA_CENTER_LNG);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(SALTA_CENTER_LAT)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickPreferredSaltaCapitalHit(hits) {
  const list = hits || [];
  if (!list.length) return null;
  const capitalHits = list.filter((hit) => neighborMunicipalityPenalty(hit) === 0);
  const pool = capitalHits.length ? capitalHits : list;
  return [...pool].sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (Math.abs(scoreDiff) > 0.15) return scoreDiff;
    return distanceToSaltaCenterKm(a) - distanceToSaltaCenterKm(b);
  })[0];
}

function buildSelectedAddressLabel({ title, line, fallback }) {
  const t = String(title || '').trim();
  const l = String(line || '').trim();
  const f = String(fallback || '').trim();
  if (t && l) {
    if (t.toLowerCase() === l.toLowerCase()) return t;
    return `${t}, ${l}`;
  }
  return t || l || f;
}

function buildSuggestionLabel(hit) {
  const baseTitle = hit?.title || String(hit?.address || '').split(',')[0];
  const baseLine = firstAddressLine(hit?.subtitle || hit?.address);
  return buildSelectedAddressLabel({
    title: baseTitle,
    line: baseLine,
    fallback: hit?.address || '',
  });
}

function preferPreciseFormattedAddress({ detailsAddress, autocompleteLabel, query }) {
  const details = String(detailsAddress || '').trim();
  const auto = String(autocompleteLabel || '').trim();
  const q = String(query || '').trim();

  if (details && !isVagueLocalityAddress(details)) return details;
  if (auto && !isVagueLocalityAddress(auto)) return auto;
  if (q && /\s+y\s+|&|esquina/i.test(q)) {
    return formatIntersectionLabelFromQuery(q);
  }
  return auto || details || q;
}

/**
 * Resuelve una sugerencia de autocomplete a coordenadas (caché Supabase + Place Details).
 */
export async function resolvePlaceSuggestion(hit, sessionToken, options = {}) {
  const labelText = buildSuggestionLabel(hit);

  if (Number.isFinite(hit?.lat) && Number.isFinite(hit?.lng)) {
    return {
      formattedAddress: preferPreciseFormattedAddress({
        detailsAddress: labelText,
        autocompleteLabel: labelText,
        query: options.query,
      }),
      lat: hit.lat,
      lng: hit.lng,
      placeId: hit.placeId || null,
      title: hit.title || null,
      subtitle: hit.subtitle || null,
      geocodeSource: null,
    };
  }

  const placeId = String(hit?.placeId || '').trim();
  if (!placeId) return null;

  if (isGoogleConfigured() && !isGooglePlaceId(placeId) && !placeId.startsWith('coord:')) {
    throw new Error('Se requiere un placeId de Google Places (google:...)');
  }

  const result = await getPlaceDetails(placeId, {
    sessionToken: hit?.sessionToken || sessionToken,
    formattedAddress: labelText,
    title: hit?.title,
    subtitle: hit?.subtitle,
  });

  const resolvedTitle = result.title || hit.title || null;
  const detailsLine = firstAddressLine(result.formattedAddress || '');
  const autocompleteLine = firstAddressLine(hit.subtitle || hit.address || '');
  const resolvedLine = isVagueLocalityAddress(detailsLine)
    ? autocompleteLine
    : detailsLine;

  const builtLabel = buildSelectedAddressLabel({
    title: resolvedTitle,
    line: isVagueLocalityAddress(resolvedLine) ? '' : resolvedLine,
    fallback: labelText,
  });

  const formattedAddress = preferPreciseFormattedAddress({
    detailsAddress: builtLabel || result.formattedAddress,
    autocompleteLabel: labelText,
    query: options.query,
  });

  return {
    formattedAddress,
    lat: result.lat,
    lng: result.lng,
    placeId: result.placeId || placeId,
    title: resolvedTitle,
    subtitle: result.subtitle || hit.subtitle || null,
    geocodeSource: result.geocodeSource || null,
  };
}

function hasCoordinates(item) {
  return Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng));
}

/** Lugares ya guardados. Si la caché no responde, se sigue con la búsqueda normal. */
async function cachedPlacesFirst(query, limit) {
  try {
    const rows = await Promise.race([
      searchCachedPlaces(query, limit),
      new Promise((resolve) => { setTimeout(() => resolve([]), 400); }),
    ]);
    return (Array.isArray(rows) ? rows : []).filter(hasCoordinates);
  } catch {
    return [];
  }
}

function fromCache(item, query) {
  return {
    formattedAddress: item.formattedAddress || item.address || item.title,
    lat: Number(item.lat),
    lng: Number(item.lng),
    placeId: item.placeId || null,
    title: item.title || null,
    subtitle: item.subtitle || null,
    geocodeSource: 'cache',
    score: textScore(item, query),
  };
}

function textScore(hit, query) {
  const label = [hit?.title, hit?.subtitle, hit?.formattedAddress, hit?.address].filter(Boolean).join(', ');
  return Math.max(
    scoreCandidateAgainstQuery(label, query),
    scoreCandidateAgainstQuery(hit?.title || '', query),
  );
}

/**
 * Autocomplete y, como máximo, dos Place Details: el que mejor coincide con el texto.
 * El resto no se consulta. Así una búsqueda no paga coordenadas de todas las opciones.
 */
export async function autocompleteAndResolveAddresses(query, maxResults = 5, options = {}) {
  const text = String(query || '').trim();
  if (!text) return [];

  const remembered = (await cachedPlacesFirst(text, maxResults))
    .map((item) => fromCache(item, text))
    .sort((a, b) => b.score - a.score);
  const saved = (await findSavedPinnedAddresses(text).catch(() => [])).map((item) => ({
    ...item,
    score: 1,
  }));
  const preferred = [...saved, ...remembered.filter((item) => !saved.some((row) => row.placeId === item.placeId))];
  if (preferred.length >= maxResults) return preferred.slice(0, maxResults);

  const seen = new Set(preferred.map((item) => item.placeId).filter(Boolean));
  const sessionToken = options.sessionToken || createSessionToken();
  const suggestions = await autocompleteAddressSalta(text, Math.max(maxResults, 5), {
    sessionToken,
  });
  const ranked = [...suggestions]
    .filter((item) => !seen.has(item?.placeId))
    .sort((a, b) => textScore(b, text) - textScore(a, text));

  const resolved = [];
  let detailsUsed = 0;
  const room = maxResults - preferred.length;
  for (const hit of ranked) {
    if (resolved.length >= room || detailsUsed >= 2) break;
    const alreadyPinned = Number.isFinite(Number(hit?.lat)) && Number.isFinite(Number(hit?.lng));
    try {
      const effectiveToken = detailsUsed > 0 ? undefined : (hit?.sessionToken || sessionToken);
      if (!alreadyPinned) detailsUsed += 1;
      const place = await resolvePlaceSuggestion(
        { ...hit, sessionToken: alreadyPinned ? undefined : effectiveToken },
        alreadyPinned ? undefined : effectiveToken,
        { query: text },
      );
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
      resolved.push({
        ...place,
        score: scoreCandidateAgainstQuery(place.formattedAddress, text),
      });
    } catch {
      // probar siguiente sugerencia
    }
  }

  return [...preferred, ...resolved
    .filter((item) => item.score >= 0.10)
    .sort((a, b) => {
      const penaltyDiff = neighborMunicipalityPenalty(a) - neighborMunicipalityPenalty(b);
      if (penaltyDiff !== 0) return penaltyDiff;
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (Math.abs(scoreDiff) > 0.15) return scoreDiff;
      return distanceToSaltaCenterKm(a) - distanceToSaltaCenterKm(b);
    })].slice(0, maxResults);
}

/**
 * Geocodifica una dirección usando autocomplete + mejor match + Place Details.
 * Elige por score contra el query (no el primer hit de Google): evita que
 * "Calle Alvarado 550" resuelva a "Pasaje Ministro Alvarado".
 */
export async function geocodeAddressViaPlaces(query, options = {}) {
  const text = String(query || '').trim();
  if (!text) throw new Error('Dirección vacía');

  const pinned = findPinnedAddress(text);
  if (pinned) {
    const suggestion = pinnedAddressSuggestion(pinned);
    return {
      formattedAddress: suggestion.formattedAddress,
      lat: suggestion.lat,
      lng: suggestion.lng,
      placeId: suggestion.placeId,
      geocodeSource: 'pinned',
    };
  }

  const savedHit = (await findSavedPinnedAddresses(text).catch(() => []))[0];
  if (savedHit) {
    return {
      formattedAddress: savedHit.formattedAddress,
      lat: savedHit.lat,
      lng: savedHit.lng,
      placeId: savedHit.placeId,
      geocodeSource: 'saved',
    };
  }

  if (!isGoogleConfigured()) {
    throw new Error('Google Places no configurado');
  }

  const remembered = (await cachedPlacesFirst(text, 5))
    .map((item) => fromCache(item, text))
    .sort((a, b) => b.score - a.score);
  if (remembered[0] && remembered[0].score > 0) {
    const best = remembered[0];
    return {
      formattedAddress: best.formattedAddress,
      lat: best.lat,
      lng: best.lng,
      placeId: best.placeId || null,
      geocodeSource: 'cache',
    };
  }

  const sessionToken = options.sessionToken || createSessionToken();
  let suggestions = await autocompleteAddressSalta(text, 5, { sessionToken });
  if (needsGoogleCoverage(suggestions, text)) {
    const google = await searchGooglePlacesLastResort(text, 5, { sessionToken }).catch(() => []);
    const seen = new Set(suggestions.map((item) => item?.placeId).filter(Boolean));
    suggestions = [
      ...google.filter((item) => item?.placeId && !seen.has(item.placeId)),
      ...suggestions,
    ];
  }
  const ranked = [...suggestions].sort((a, b) => textScore(b, text) - textScore(a, text));

  const resolved = [];
  let detailsUsed = 0;
  for (const hit of ranked) {
    if (detailsUsed >= 2) break;
    try {
      const alreadyPinned = Number.isFinite(Number(hit?.lat)) && Number.isFinite(Number(hit?.lng));
      const effectiveToken = detailsUsed > 0 ? undefined : (hit?.sessionToken || sessionToken);
      if (!alreadyPinned) detailsUsed += 1;
      const place = await resolvePlaceSuggestion(
        { ...hit, sessionToken: alreadyPinned ? undefined : effectiveToken },
        alreadyPinned ? undefined : effectiveToken,
        { query: text },
      );
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;

      const labelForScore = [place.title, place.formattedAddress].filter(Boolean).join(', ');
      const score = Math.max(
        scoreCandidateAgainstQuery(place.formattedAddress, text),
        scoreCandidateAgainstQuery(labelForScore, text),
        scoreCandidateAgainstQuery(hit?.title || '', text),
      );
      resolved.push({
        formattedAddress: place.formattedAddress,
        lat: place.lat,
        lng: place.lng,
        placeId: place.placeId || null,
        title: place.title || hit?.title || null,
        subtitle: place.subtitle || hit?.subtitle || null,
        geocodeSource: place.geocodeSource || null,
        score,
      });
      if (score >= 0.35) break;
    } catch {
      // Probar la siguiente sugerencia del autocomplete.
    }
  }

  resolved.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const scored = resolved.filter((item) => Number(item.score || 0) >= 0.35);
  const best = pickPreferredSaltaCapitalHit(scored.length ? scored : resolved);
  if (!best) {
    throw new Error('No se encontró la dirección');
  }

  const formattedAddress = preferPreciseFormattedAddress({
    detailsAddress: best.formattedAddress,
    autocompleteLabel: buildSuggestionLabel({
      title: best.title,
      subtitle: best.subtitle,
      address: best.formattedAddress,
    }),
    query: text,
  });

  return {
    formattedAddress,
    lat: best.lat,
    lng: best.lng,
    placeId: best.placeId || null,
    geocodeSource: best.geocodeSource || null,
  };
}

/**
 * Candidatos de poll desde Google Autocomplete (New) — misma fuente que AddressAutocomplete
 * del dashboard. No geocodifica: las coords se resuelven al elegir la opción en el poll.
 */
export async function getAutocompletePollCandidates(query, maxResults = 5, options = {}) {
  const text = String(query || '').trim();
  if (!text) return [];

  const sessionToken = options.sessionToken || createSessionToken();
  let suggestions = await autocompleteAddressSalta(text, Math.max(maxResults, 5), {
    sessionToken,
  });
  if (needsGoogleCoverage(suggestions, text)) {
    const google = await searchGooglePlacesLastResort(text, Math.max(maxResults, 5), { sessionToken }).catch(() => []);
    const seen = new Set(suggestions.map((item) => item?.placeId).filter(Boolean));
    suggestions = [
      ...google.filter((item) => item?.placeId && !seen.has(item.placeId)),
      ...suggestions,
    ];
  }

  return suggestions.slice(0, maxResults).map((hit) => {
    const title = String(hit?.title || '').trim();
    const subtitle = String(hit?.subtitle || '').trim();
    const formattedAddress = String(hit?.address || '').trim()
      || (subtitle ? `${title}, ${subtitle}` : title);

    return {
      formattedAddress,
      title,
      subtitle,
      placeId: hit?.placeId || null,
      sessionToken: hit?.sessionToken || sessionToken,
      lat: null,
      lng: null,
      score: scoreCandidateAgainstQuery(formattedAddress, text),
      source: String(hit?.placeId || '').startsWith('google:') ? 'google_autocomplete' : 'local',
    };
  });
}

export { isGoogleConfigured, createSessionToken, isVagueLocalityAddress, formatIntersectionLabelFromQuery };
