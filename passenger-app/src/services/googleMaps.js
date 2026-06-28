export { getDirections } from './routing';
import {
  geocodeAddress,
  geocodeAddressMultiple,
  reverseGeocode,
  autocompleteAddressSalta as autocompleteAddressSaltaBase,
  getPlaceDetails,
  readDashboardUrl,
  firstAddressLine,
  buildSelectedAddressLabel,
  isCoordinateFallbackText,
  resolvePlaceFromSuggestion,
} from './nominatim';
export { decodePolyline, getDistanceMeters } from '../utils/polyline';

function foldText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAddressText(item) {
  return String(item?.address || item?.title || '').trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasStreetNumber(item, number) {
  const text = foldText(getAddressText(item));
  const numPattern = new RegExp(`\\b${escapeRegex(number)}\\b`);
  return numPattern.test(text);
}

function suggestionKey(item) {
  return item?.placeId || `${item?.lat},${item?.lng}` || foldText(getAddressText(item));
}

function extractStreetAndNumber(query) {
  const raw = String(query || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  const withAl = raw.match(
    /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.'-]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.'-]+)*)\s+al\s+(\d{1,5}[a-zA-Z]?)$/i,
  );
  if (withAl) {
    return { street: withAl[1].trim(), number: withAl[2].trim() };
  }

  const simple = raw.match(
    /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.'-]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.'-]+)*)\s+(\d{1,5}[a-zA-Z]?)$/i,
  );
  if (!simple) return null;

  return { street: simple[1].trim(), number: simple[2].trim() };
}

function isDoctorAGuemesWithNumber(item, number) {
  const text = foldText(getAddressText(item));
  const numPattern = new RegExp(`\\b${String(number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return (
    numPattern.test(text)
    && /\b(dr\.?\s*a\.?\s*guemes|doctor\s+a\.?\s*guemes)\b/.test(text)
    && !/\badolfo\s+guemes\b/.test(text)
  );
}

function pickDoctorAGuemesHit(hits, number) {
  const withNumber = (hits || []).filter((item) => isDoctorAGuemesWithNumber(item, number));
  if (!withNumber.length) return null;

  return withNumber.find((item) => {
    const subtitle = foldText(item?.subtitle || '');
    return subtitle.includes('salta') && !subtitle.includes('villa san lorenzo');
  }) || withNumber[0];
}

/**
 * Autocomplete alineado con Google Maps: respeta el orden del backend y solo
 * complementa Güemes+altura con Doctor A. Güemes {n} si falta en el top.
 */
export async function autocompleteAddressSalta(query, limit = 5, options = {}) {
  const text = String(query || '').trim();
  if (text.length < 2) return [];

  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 5, 8));
  const fetchLimit = Math.min(normalizedLimit + 2, 8);

  const primary = await autocompleteAddressSaltaBase(text, fetchLimit, options);
  const parsed = extractStreetAndNumber(text);
  const isGuemesWithNumber = parsed && /\bguemes\b/i.test(parsed.street);

  if (!isGuemesWithNumber) {
    return primary.slice(0, normalizedLimit);
  }

  const seen = new Set();
  const results = [];
  for (const item of primary) {
    if (!hasStreetNumber(item, parsed.number)) continue;
    const key = suggestionKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }

  if (!results.length) {
    for (const item of primary) {
      const key = suggestionKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
  }

  const hasDoctorA = results.some((item) => isDoctorAGuemesWithNumber(item, parsed.number));
  if (!hasDoctorA) {
    const doctorHits = await autocompleteAddressSaltaBase(
      `doctor a guemes ${parsed.number}`,
      3,
      options,
    );
    const doctorA = pickDoctorAGuemesHit(doctorHits, parsed.number);
    const key = doctorA ? suggestionKey(doctorA) : null;

    if (doctorA && key && !seen.has(key)) {
      // Google Maps suele mostrar Doctor A. Güemes en ~4.º lugar.
      const insertAt = Math.min(3, results.length);
      results.splice(insertAt, 0, doctorA);
      seen.add(key);
    }
  }

  return results.slice(0, normalizedLimit);
}

export {
  geocodeAddress,
  geocodeAddressMultiple,
  reverseGeocode,
  getPlaceDetails,
  readDashboardUrl,
  firstAddressLine,
  buildSelectedAddressLabel,
  isCoordinateFallbackText,
  resolvePlaceFromSuggestion,
};
