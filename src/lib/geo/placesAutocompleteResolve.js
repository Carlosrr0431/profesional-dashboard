/**
 * Resolución server-side de sugerencias de autocomplete — misma lógica que
 * AddressAutocomplete + GET /api/geo/geocode (Place Details Essentials + caché Supabase).
 */
import { autocompleteAddressSalta, getPlaceDetails } from './index.js';
import {
  isGoogleConfigured,
  isGooglePlaceId,
  createSessionToken,
} from '../../../shared/geo/googlePlaces.js';
import {
  scoreCandidateAgainstQuery,
  isVagueLocalityAddress,
  formatIntersectionLabelFromQuery,
} from '../../../shared/salta-address.js';

function firstAddressLine(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.split(',')[0]?.trim() || '';
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

/**
 * Autocomplete + resolución de cada sugerencia (misma pila que NewTripModal).
 *
 * BILLING: el sessionToken principal cierra la sesión con el PRIMER Place Details.
 * Las sugerencias restantes son calls independientes (sin token propio o con token
 * nuevo) para no mezclar sesiones ya cerradas — Google las cobra como Essentials
 * individuales, pero el cache Supabase/in-memory evita la mayoría de esas calls.
 */
export async function autocompleteAndResolveAddresses(query, maxResults = 5, options = {}) {
  const text = String(query || '').trim();
  if (!text) return [];

  const sessionToken = options.sessionToken || createSessionToken();
  const suggestions = await autocompleteAddressSalta(text, Math.max(maxResults, 5), {
    sessionToken,
  });

  const resolved = [];
  let sessionUsed = false;
  for (const hit of suggestions.slice(0, maxResults)) {
    try {
      // El sessionToken del hit ya lleva el token actual (re-inyectado en autocomplete).
      // Solo la primera call usa ese token para cerrar la sesión; las demás reciben
      // undefined y fetchPlaceDetailsEssentials no añade sessionToken a la URL.
      const effectiveToken = sessionUsed ? undefined : (hit?.sessionToken || sessionToken);
      const place = await resolvePlaceSuggestion(
        { ...hit, sessionToken: effectiveToken },
        effectiveToken,
        { query: text },
      );
      sessionUsed = true;
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
      resolved.push({
        ...place,
        score: scoreCandidateAgainstQuery(place.formattedAddress, text),
      });
    } catch {
      // probar siguiente sugerencia
    }
  }

  return resolved
    .filter((item) => item.score >= 0.10)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Geocodifica una dirección usando autocomplete + mejor match + Place Details.
 * Elige por score contra el query (no el primer hit de Google): evita que
 * "Calle Alvarado 550" resuelva a "Pasaje Ministro Alvarado".
 */
export async function geocodeAddressViaPlaces(query, options = {}) {
  const text = String(query || '').trim();
  if (!text) throw new Error('Dirección vacía');

  if (!isGoogleConfigured()) {
    throw new Error('Google Places no configurado');
  }

  const sessionToken = options.sessionToken || createSessionToken();
  const suggestions = await autocompleteAddressSalta(text, 5, { sessionToken });

  const resolved = [];
  let sessionUsed = false;
  for (const hit of suggestions) {
    try {
      const effectiveToken = sessionUsed ? undefined : (hit?.sessionToken || sessionToken);
      const place = await resolvePlaceSuggestion(
        { ...hit, sessionToken: effectiveToken },
        effectiveToken,
        { query: text },
      );
      sessionUsed = true;
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
    } catch {
      // Probar la siguiente sugerencia del autocomplete.
    }
  }

  resolved.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const best = resolved.find((item) => Number(item.score || 0) >= 0.35) || resolved[0];
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
  const suggestions = await autocompleteAddressSalta(text, Math.max(maxResults, 5), {
    sessionToken,
  });

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
      source: 'google_autocomplete',
    };
  });
}

export { isGoogleConfigured, createSessionToken, isVagueLocalityAddress, formatIntersectionLabelFromQuery };
