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
import { scoreCandidateAgainstQuery } from '../../../shared/salta-address.js';
import {
  getCachedGooglePlaceDetails,
  upsertGooglePlaceDetailsCache,
} from '../googlePlaceDetailsCache.js';

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

/**
 * Resuelve una sugerencia de autocomplete a coordenadas (caché Supabase + Place Details).
 */
export async function resolvePlaceSuggestion(hit, sessionToken) {
  const labelText = buildSuggestionLabel(hit);

  if (Number.isFinite(hit?.lat) && Number.isFinite(hit?.lng)) {
    return {
      formattedAddress: labelText,
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

  let result;
  let geocodeSource = 'google_place_details_essentials';

  if (isGooglePlaceId(placeId)) {
    let cached = null;
    try {
      cached = await getCachedGooglePlaceDetails(placeId);
    } catch {
      cached = null;
    }
    if (cached) {
      result = cached;
      geocodeSource = 'supabase_cache';
    } else {
      result = await getPlaceDetails(placeId, {
        sessionToken: hit?.sessionToken || sessionToken,
        formattedAddress: labelText,
        title: hit?.title,
        subtitle: hit?.subtitle,
      });
      try {
        await upsertGooglePlaceDetailsCache({
          placeId: placeId || result.placeId,
          formattedAddress: result.formattedAddress || labelText,
          lat: result.lat,
          lng: result.lng,
          title: result.title || hit.title || null,
          subtitle: result.subtitle || hit.subtitle || null,
          types: result.types || [],
        });
      } catch {
        // La caché es opcional; no bloquear la geocodificación.
      }
    }
  } else {
    result = await getPlaceDetails(placeId, {
      sessionToken: hit?.sessionToken || sessionToken,
      formattedAddress: labelText,
      title: hit?.title,
      subtitle: hit?.subtitle,
    });
    geocodeSource = 'place_details';
  }

  const resolvedTitle = result.title || hit.title || null;
  const resolvedLine = firstAddressLine(
    result.formattedAddress || hit.subtitle || hit.address || '',
  );
  const formattedAddress = buildSelectedAddressLabel({
    title: resolvedTitle,
    line: resolvedLine,
    fallback: result.formattedAddress || labelText,
  });

  return {
    formattedAddress,
    lat: result.lat,
    lng: result.lng,
    placeId: result.placeId || placeId,
    title: resolvedTitle,
    subtitle: result.subtitle || hit.subtitle || null,
    geocodeSource,
  };
}

/**
 * Autocomplete + resolución de cada sugerencia (misma pila que NewTripModal).
 */
export async function autocompleteAndResolveAddresses(query, maxResults = 5, options = {}) {
  const text = String(query || '').trim();
  if (!text) return [];

  const sessionToken = options.sessionToken || createSessionToken();
  const suggestions = await autocompleteAddressSalta(text, Math.max(maxResults, 5), {
    sessionToken,
  });

  const resolved = [];
  for (const hit of suggestions.slice(0, maxResults)) {
    try {
      const place = await resolvePlaceSuggestion(hit, sessionToken);
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
 */
export async function geocodeAddressViaPlaces(query, options = {}) {
  const text = String(query || '').trim();
  if (!text) throw new Error('Dirección vacía');

  if (!isGoogleConfigured()) {
    throw new Error('Google Places no configurado');
  }

  const sessionToken = options.sessionToken || createSessionToken();
  const suggestions = await autocompleteAddressSalta(text, 5, { sessionToken });

  for (const hit of suggestions) {
    try {
      const place = await resolvePlaceSuggestion(hit, sessionToken);
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
      return {
        formattedAddress: place.formattedAddress,
        lat: place.lat,
        lng: place.lng,
        placeId: place.placeId || null,
        geocodeSource: place.geocodeSource || null,
      };
    } catch {
      // Probar la siguiente sugerencia del autocomplete.
    }
  }

  throw new Error('No se encontró la dirección');
}

export { isGoogleConfigured, createSessionToken };
