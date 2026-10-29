import { getSupabaseAdmin } from './supabaseAdmin';
import { foldPinnedQuery, savedAddressMatches } from '../../shared/savedAddressMatch';
import { PINNED_ADDRESSES } from '../../shared/pinned-addresses';

let cache = { at: 0, rows: [] };

export function clearSavedPinnedAddressCache() {
  cache = { at: 0, rows: [] };
}

export async function listSavedPinnedAddresses() {
  if (Date.now() - cache.at < 15000 && cache.rows.length) return cache.rows;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('pinned_addresses')
      .select('id, title, lat, lng')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) return withBuiltins(cache.rows);
    const rows = await ensureBuiltinAddresses(supabase, data || []);
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return withBuiltins(cache.rows);
  }
}

function withBuiltins(rows) {
  const seen = new Set((rows || []).map((row) => foldPinnedQuery(row.title)));
  const extras = PINNED_ADDRESSES
    .filter((item) => !seen.has(foldPinnedQuery(item.title)))
    .map((item) => ({
      id: `pinned:${item.id}`,
      title: item.title,
      lat: item.lat,
      lng: item.lng,
    }));
  return [...extras, ...(rows || [])];
}

async function ensureBuiltinAddresses(supabase, rows) {
  const valid = (rows || []).filter((row) => (
    row?.title && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng))
  ));
  const seen = new Set(valid.map((row) => foldPinnedQuery(row.title)));
  const missing = PINNED_ADDRESSES.filter((item) => !seen.has(foldPinnedQuery(item.title)));
  if (!missing.length) return valid;
  const { data, error } = await supabase
    .from('pinned_addresses')
    .insert(missing.map((item) => ({ title: item.title, lat: item.lat, lng: item.lng })))
    .select('id, title, lat, lng');
  if (error) return withBuiltins(valid);
  return [...valid, ...(data || [])];
}

export function suggestionFromSavedAddress(row) {
  const title = String(row.title || '').trim();
  return {
    title,
    subtitle: 'Salta',
    address: `${title}, Salta`,
    formattedAddress: `${title}, Salta`,
    lat: Number(row.lat),
    lng: Number(row.lng),
    placeId: `saved:${row.id}`,
    geocodeSource: 'saved',
  };
}

export async function findSavedPinnedAddresses(query) {
  const rows = await listSavedPinnedAddresses();
  return rows
    .filter((row) => savedAddressMatches(row.title, query))
    .map(suggestionFromSavedAddress);
}
