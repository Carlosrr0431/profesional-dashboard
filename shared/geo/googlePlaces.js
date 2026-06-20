/**
 * Google Places API (New - v1) para búsqueda de POIs en Salta Capital.
 *
 * Solo usa campos de Basic Data (GRATUITOS):
 *   places.id, places.displayName, places.formattedAddress,
 *   places.location, places.types, places.primaryType
 *
 * No usa Atmosphere Data, Contact Data ni Reviews (tienen costo).
 *
 * Docs: https://developers.google.com/maps/documentation/places/web-service/op-overview
 */

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

// Campos Basic Data (gratuitos) para búsquedas
const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.types',
  'places.primaryType',
].join(',');

// Campos Basic Data (gratuitos) para Place Details
const DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
].join(',');

const SALTA_CENTER = { latitude: -24.7829, longitude: -65.4122 };
const SALTA_RADIUS_M = 22000;
const PLACES_TIMEOUT_MS = 8000;

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

/** Un placeId de Google tiene el prefijo "google:" para distinguirlo de los de Nominatim. */
function isGooglePlaceId(placeId) {
  return String(placeId || '').startsWith('google:');
}

/**
 * Convierte los tipos de Google Places a clases OSM compatibles
 * con el resto del sistema (collectAutocompleteCandidates, etc.).
 */
function mapGoogleTypes(types) {
  const t = Array.isArray(types) ? types : [];
  if (t.includes('hospital') || t.includes('doctor') || t.includes('health')) {
    return { osmClass: 'amenity', osmType: 'hospital' };
  }
  if (t.includes('university') || t.includes('school') || t.includes('primary_school')) {
    return { osmClass: 'amenity', osmType: 'university' };
  }
  if (t.includes('shopping_mall')) return { osmClass: 'shop', osmType: 'mall' };
  if (t.includes('stadium')) return { osmClass: 'leisure', osmType: 'stadium' };
  if (t.includes('museum')) return { osmClass: 'tourism', osmType: 'museum' };
  if (t.includes('bus_station') || t.includes('transit_station')) {
    return { osmClass: 'amenity', osmType: 'bus_station' };
  }
  if (t.includes('airport')) return { osmClass: 'aeroway', osmType: 'aerodrome' };
  if (t.includes('pharmacy')) return { osmClass: 'amenity', osmType: 'pharmacy' };
  if (t.includes('bank') || t.includes('atm')) {
    return { osmClass: 'amenity', osmType: 'bank' };
  }
  if (t.includes('supermarket') || t.includes('grocery_or_supermarket')) {
    return { osmClass: 'shop', osmType: 'supermarket' };
  }
  if (t.includes('restaurant') || t.includes('cafe') || t.includes('food')) {
    return { osmClass: 'amenity', osmType: 'restaurant' };
  }
  if (t.includes('gas_station')) return { osmClass: 'amenity', osmType: 'fuel' };
  if (t.includes('real_estate_agency')) return { osmClass: 'office', osmType: 'poi' };
  // Cualquier establecimiento/punto de interés
  return { osmClass: 'amenity', osmType: 'poi' };
}

/**
 * Convierte un lugar de la API de Google al formato interno del sistema.
 * Retorna null si no tiene coordenadas válidas.
 */
function mapGooglePlace(place) {
  const lat = Number(place?.location?.latitude);
  const lng = Number(place?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name = String(place?.displayName?.text || '').trim();
  const formatted = String(place?.formattedAddress || name || '').trim();
  if (!formatted) return null;

  const types = Array.isArray(place?.types) ? place.types : [];
  const { osmClass, osmType } = mapGoogleTypes(types);

  return {
    lat,
    lng,
    formattedAddress: formatted,
    // Prefijo "google:" para identificar el origen en getPlaceDetails
    placeId: place.id ? `google:${place.id}` : `coord:${lat.toFixed(6)},${lng.toFixed(6)}`,
    importance: 0.55,   // Google Places es relevante para POIs
    osmClass,
    osmType,
    address: {},
    poiName: name || undefined,
  };
}

/**
 * Petición HTTP a la Places API (New) con timeout y manejo de errores.
 * Retorna null si la API key no está configurada o si hay error.
 */
async function placesRequest(path, options = {}) {
  const key = readGoogleApiKey();
  if (!key) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS) : null;

  try {
    const response = await fetch(`${PLACES_API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        ...(options.headers || {}),
      },
      signal: controller?.signal,
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Busca POIs por texto libre usando Text Search (New) — Basic Data (gratuito).
 * Devuelve resultados con coordenadas, listos para collectAutocompleteCandidates.
 *
 * @param {string} query - Texto de búsqueda (ej: "remax noa", "shoping", "jaraba")
 * @param {number} limit - Máximo de resultados (1-20)
 */
async function searchPoiSalta(query, limit = 8) {
  const text = String(query || '').trim();
  if (!text || !isGoogleConfigured()) return [];

  // Agregar "Salta, Argentina" si no está presente para acotar geográficamente
  const textQuery = /salta/i.test(text) ? text : `${text}, Salta, Argentina`;

  const data = await placesRequest('/places:searchText', {
    method: 'POST',
    headers: { 'X-Goog-FieldMask': SEARCH_FIELD_MASK },
    body: JSON.stringify({
      textQuery,
      languageCode: 'es',
      regionCode: 'AR',
      locationBias: {
        circle: {
          center: SALTA_CENTER,
          radius: SALTA_RADIUS_M,
        },
      },
      maxResultCount: Math.min(Math.max(1, limit), 20),
    }),
  });

  return (Array.isArray(data?.places) ? data.places : [])
    .map(mapGooglePlace)
    .filter(Boolean);
}

/**
 * Obtiene coordenadas y dirección de un lugar por su Google placeId.
 * Acepta placeIds con o sin el prefijo "google:".
 * Basic Data (gratuito): location + formattedAddress.
 *
 * @param {string} placeId - placeId con prefijo "google:" o el ID nativo de Google
 */
async function getGooglePlaceDetails(placeId) {
  const rawId = String(placeId || '').replace(/^google:/, '').trim();
  if (!rawId) throw new Error('place_id de Google inválido');

  if (!isGoogleConfigured()) {
    throw new Error('GOOGLE_MAPS_API_KEY no configurada');
  }

  const data = await placesRequest(`/places/${encodeURIComponent(rawId)}`, {
    method: 'GET',
    headers: {
      'X-Goog-FieldMask': DETAIL_FIELD_MASK,
      'Accept-Language': 'es',
    },
  });

  if (!data) throw new Error('No se pudo obtener detalles del lugar de Google');

  const lat = Number(data?.location?.latitude);
  const lng = Number(data?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Google Places no devolvió coordenadas válidas');
  }

  return {
    lat,
    lng,
    formattedAddress: String(
      data.formattedAddress || data?.displayName?.text || '',
    ).trim(),
  };
}

module.exports = {
  searchPoiSalta,
  getGooglePlaceDetails,
  isGooglePlaceId,
  isGoogleConfigured,
};
