import { getSupabaseAdmin } from './supabaseAdmin';

const GOOGLE_PLACE_CACHE_TABLE = 'google_place_details_cache';

function normalizePlaceId(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  return input.startsWith('google:') ? input : `google:${input}`;
}

function parseTypes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      }
    } catch {
      // ignorar parse fallido
    }
  }
  return [];
}

function mapRowToDetails(row) {
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const placeId = normalizePlaceId(row?.place_id);
  if (!placeId) return null;

  return {
    placeId,
    lat,
    lng,
    formattedAddress: String(row?.formatted_address || '').trim() || null,
    title: String(row?.title || '').trim() || null,
    subtitle: String(row?.subtitle || '').trim() || null,
    types: parseTypes(row?.types),
  };
}

export async function getCachedGooglePlaceDetails(placeId) {
  const normalizedPlaceId = normalizePlaceId(placeId);
  if (!normalizedPlaceId) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(GOOGLE_PLACE_CACHE_TABLE)
    .select('place_id, formatted_address, title, subtitle, lat, lng, types')
    .eq('place_id', normalizedPlaceId)
    .maybeSingle();

  if (error) throw error;
  return mapRowToDetails(data);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCachedAddressLabel(mapped) {
  if (!mapped) return null;
  const title = String(mapped.title || '').trim();
  const subtitle = String(mapped.subtitle || '').trim();
  const formatted = String(mapped.formattedAddress || '').trim();
  if (title && subtitle) {
    if (title.toLowerCase() === subtitle.toLowerCase()) return title;
    return `${title}, ${subtitle}`;
  }
  return formatted || title || subtitle || null;
}

/**
 * Busca en cache Supabase un POI cercano a las coordenadas (p. ej. GPS del pasajero).
 */
export async function getCachedGooglePlaceDetailsNearCoords(lat, lng, maxDistanceMeters = 120) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;

  const delta = maxDistanceMeters / 111320;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(GOOGLE_PLACE_CACHE_TABLE)
    .select('place_id, formatted_address, title, subtitle, lat, lng, types')
    .gte('lat', parsedLat - delta)
    .lte('lat', parsedLat + delta)
    .gte('lng', parsedLng - delta)
    .lte('lng', parsedLng + delta)
    .limit(25);

  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) return null;

  let best = null;
  let bestDistance = maxDistanceMeters;
  for (const row of data) {
    const mapped = mapRowToDetails(row);
    if (!mapped) continue;
    const distance = haversineMeters(parsedLat, parsedLng, mapped.lat, mapped.lng);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = mapped;
    }
  }

  if (!best) return null;
  return {
    ...best,
    formattedAddress: formatCachedAddressLabel(best) || best.formattedAddress,
    geocodeSource: 'supabase_cache',
  };
}

export async function upsertGooglePlaceDetailsCache(details) {
  const normalizedPlaceId = normalizePlaceId(details?.placeId);
  const lat = Number(details?.lat);
  const lng = Number(details?.lng);
  if (!normalizedPlaceId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const payload = {
    place_id: normalizedPlaceId,
    formatted_address: String(details?.formattedAddress || '').trim() || null,
    title: String(details?.title || '').trim() || null,
    subtitle: String(details?.subtitle || '').trim() || null,
    lat,
    lng,
    types: Array.isArray(details?.types) ? details.types : [],
    last_seen_at: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(GOOGLE_PLACE_CACHE_TABLE)
    .upsert(payload, { onConflict: 'place_id' })
    .select('place_id, formatted_address, title, subtitle, lat, lng, types')
    .single();

  if (error) throw error;
  return mapRowToDetails(data);
}
