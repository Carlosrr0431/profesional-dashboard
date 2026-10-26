import { getSupabaseAdmin } from './supabaseAdmin';
import { upsertGooglePlaceDetailsCache } from './googlePlaceDetailsCache';
import {
  PLACES_MONTHLY_CALL_LIMIT,
  cachedPoiMatches,
  foldPlaceText,
  interpretPlacesConsume,
  placeQueryTokens,
  placesBillingPeriod,
} from '../../shared/geo/placesBudget.js';

const SEARCH_TABLE = 'google_places_search_cache';
const POI_TABLE = 'google_places_poi_cache';

let memory = { period: null, count: null };

function remember(period, count) {
  memory = { period, count };
}

export function resetPlacesBudgetMemory() {
  memory = { period: null, count: null };
}

export async function readPlacesBudget() {
  const period = placesBillingPeriod();
  if (memory.period === period && memory.count != null) {
    return { period, calls: memory.count, limit: PLACES_MONTHLY_CALL_LIMIT };
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('google_places_usage')
    .select('call_count')
    .eq('period', period)
    .maybeSingle();
  if (error) throw error;
  const calls = Number(data?.call_count || 0);
  remember(period, calls);
  return { period, calls, limit: PLACES_MONTHLY_CALL_LIMIT };
}

/** true solo si esta llamada entra en las 9000 del mes. Si la base falla, no se llama a Google. */
export async function tryConsumePlacesCall() {
  const period = placesBillingPeriod();
  if (memory.period === period && memory.count != null && memory.count >= PLACES_MONTHLY_CALL_LIMIT) {
    return false;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('consume_google_places_call', {
    p_period: period,
    p_limit: PLACES_MONTHLY_CALL_LIMIT,
  });
  if (error) return false;

  const result = interpretPlacesConsume(data, PLACES_MONTHLY_CALL_LIMIT);
  if (!result.allowed) {
    remember(period, PLACES_MONTHLY_CALL_LIMIT);
    return false;
  }
  remember(period, result.count);
  return true;
}

export async function getCachedPlacesSearch(queryKey) {
  const key = String(queryKey || '').trim();
  if (!key) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(SEARCH_TABLE)
    .select('suggestions')
    .eq('query_key', key)
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.suggestions) && data.suggestions.length ? data.suggestions : null;
}

function poiRow(item) {
  const placeId = String(item?.placeId || '').trim();
  if (!placeId.startsWith('google:')) return null;
  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  return {
    place_id: placeId,
    title: String(item?.title || item?.poiName || '').trim() || null,
    subtitle: String(item?.subtitle || '').trim() || null,
    formatted_address: String(item?.formattedAddress || item?.address || '').trim() || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    types: Array.isArray(item?.types) ? item.types : [],
    search_text: foldPlaceText(`${item?.title || item?.poiName || ''} ${item?.subtitle || ''} ${item?.formattedAddress || item?.address || ''}`),
    updated_at: new Date().toISOString(),
  };
}

function suggestionFromRow(row) {
  const title = String(row?.title || '').trim();
  const subtitle = String(row?.subtitle || '').trim();
  const address = String(row?.formatted_address || '').trim() || [title, subtitle].filter(Boolean).join(', ');
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  if (!title && !address) return null;
  const suggestion = {
    placeId: row.place_id,
    title: title || address.split(',')[0],
    subtitle,
    address,
    formattedAddress: address,
    poiName: title || null,
    types: Array.isArray(row?.types) ? row.types : [],
  };
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    suggestion.lat = lat;
    suggestion.lng = lng;
  }
  return suggestion;
}

function rankRows(rows, query, limit) {
  const tokens = placeQueryTokens(query);
  if (!tokens.length) return [];
  const seen = new Set();
  const hits = [];
  for (const row of rows) {
    const id = String(row?.place_id || '').trim();
    if (!id || seen.has(id)) continue;
    const blob = `${row?.title || ''} ${row?.subtitle || ''} ${row?.formatted_address || ''} ${row?.search_text || ''}`;
    if (!cachedPoiMatches(blob, query)) continue;
    const suggestion = suggestionFromRow(row);
    if (!suggestion) continue;
    seen.add(id);
    hits.push(suggestion);
    if (hits.length >= limit) break;
  }
  return hits;
}

async function rowsForToken(table, token) {
  const safe = String(token || '').replace(/[^a-z0-9]/g, '');
  if (safe.length < 3) return [];
  const supabase = getSupabaseAdmin();
  const pattern = `%${safe}%`;
  const poi = await supabase
    .from(table)
    .select('place_id, title, subtitle, formatted_address, lat, lng, types, search_text')
    .or(`search_text.ilike.${pattern},title.ilike.${pattern},subtitle.ilike.${pattern},formatted_address.ilike.${pattern}`)
    .limit(40);
  if (!poi.error) return poi.data || [];
  const fallback = await supabase
    .from(table)
    .select('place_id, title, subtitle, formatted_address, lat, lng, types')
    .or(`title.ilike.${pattern},subtitle.ilike.${pattern},formatted_address.ilike.${pattern}`)
    .limit(40);
  if (fallback.error) return [];
  return fallback.data || [];
}

/** Lugares ya guardados (viajes de Google y direcciones con coordenadas) que coinciden con lo escrito. */
export async function getCachedPoiWithCoords(placeId) {
  const id = String(placeId || '').trim();
  const normalized = id.startsWith('google:') ? id : (id ? `google:${id}` : '');
  if (!normalized) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(POI_TABLE)
    .select('place_id, title, subtitle, formatted_address, lat, lng, types')
    .eq('place_id', normalized)
    .maybeSingle();
  if (error || !data) return null;
  const suggestion = suggestionFromRow(data);
  if (!suggestion || !Number.isFinite(suggestion.lat) || !Number.isFinite(suggestion.lng)) return null;
  return suggestion;
}

export async function searchCachedPlaces(query, limit = 8) {
  const tokens = placeQueryTokens(query).sort((a, b) => b.length - a.length);
  const token = tokens[0];
  if (!token) return [];
  const cap = Math.max(1, Math.min(limit, 8));
  const [pois, details] = await Promise.all([
    rowsForToken(POI_TABLE, token).catch(() => []),
    rowsForToken('google_place_details_cache', token).catch(() => []),
  ]);
  return rankRows([...(pois || []), ...(details || [])], query, cap);
}

async function savePlacesPois(suggestions) {
  const rows = (suggestions || []).map(poiRow).filter(Boolean);
  if (!rows.length) return;
  const supabase = getSupabaseAdmin();
  await supabase.from(POI_TABLE).upsert(rows, { onConflict: 'place_id' });
  await Promise.all(rows.filter((row) => row.lat != null && row.lng != null).map((row) => (
    upsertGooglePlaceDetailsCache({
      placeId: row.place_id,
      formattedAddress: row.formatted_address,
      title: row.title,
      subtitle: row.subtitle,
      lat: row.lat,
      lng: row.lng,
      types: row.types,
    }).catch(() => null)
  )));
}

export async function savePlacesSearch(queryKey, suggestions) {
  const key = String(queryKey || '').trim();
  const list = Array.isArray(suggestions) ? suggestions : [];
  if (!key || !list.length) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(SEARCH_TABLE).upsert({
    query_key: key,
    suggestions: list,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'query_key' });
  if (error) throw error;
  await savePlacesPois(list);
}
