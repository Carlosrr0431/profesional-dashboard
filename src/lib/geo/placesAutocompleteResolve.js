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
