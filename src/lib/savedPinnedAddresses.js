import { getSupabaseAdmin } from './supabaseAdmin';
import { savedAddressMatches } from '../../shared/savedAddressMatch';

let cache = { at: 0, rows: [] };

export function clearSavedPinnedAddressCache() {
  cache = { at: 0, rows: [] };
}

export async function listSavedPinnedAddresses() {
  if (Date.now() - cache.at < 15000) return cache.rows;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('pinned_addresses')
      .select('id, title, lat, lng')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) return cache.rows;
    const rows = (data || []).filter((row) => (
      row?.title && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng))
    ));
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return cache.rows;
  }
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
