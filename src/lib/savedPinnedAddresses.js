import { getSupabaseAdmin } from './supabaseAdmin';
import { foldPinnedQuery, savedAddressMatches } from '../../shared/savedAddressMatch';
import { PINNED_ADDRESSES } from '../../shared/pinned-addresses';

let cache = { at: 0, rows: [] };

export function clearSavedPinnedAddressCache() {
  cache = { at: 0, rows: [] };
}

export async function listSavedPinnedAddresses() {
  if (Date.now() - cache.at < 2000 && cache.rows.length) return cache.rows;
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

function samePinnedPoint(a, b) {
  return Math.abs(Number(a?.lat) - Number(b?.lat)) < 0.00002
    && Math.abs(Number(a?.lng) - Number(b?.lng)) < 0.00002;
}

function withBuiltins(rows) {
  const extras = PINNED_ADDRESSES
    .filter((item) => !(rows || []).some((row) => (
      foldPinnedQuery(row.title) === foldPinnedQuery(item.title) || samePinnedPoint(row, item)
    )))
    .map((item) => ({
      id: `pinned:${item.id}`,
      title: item.title,
      lat: item.lat,
      lng: item.lng,
    }));
  return dedupePinnedRows([...extras, ...(rows || [])]);
}

function dedupePinnedRows(rows) {
  const builtinTitles = new Set(PINNED_ADDRESSES.map((item) => foldPinnedQuery(item.title)));
  const kept = [];
  for (const row of rows || []) {
    const index = kept.findIndex((item) => samePinnedPoint(item, row));
    if (index === -1) {
      kept.push(row);
      continue;
    }
    const current = kept[index];
    const currentIsBuiltin = builtinTitles.has(foldPinnedQuery(current.title));
    const nextIsBuiltin = builtinTitles.has(foldPinnedQuery(row.title));
    if (currentIsBuiltin && !nextIsBuiltin) kept[index] = row;
  }
  return kept;
}

async function ensureBuiltinAddresses(supabase, rows) {
  const valid = (rows || []).filter((row) => (
    row?.title && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng))
  ));
  const builtinTitles = new Set(PINNED_ADDRESSES.map((item) => foldPinnedQuery(item.title)));
  const duplicateIds = valid
    .filter((row) => builtinTitles.has(foldPinnedQuery(row.title)))
    .filter((row) => valid.some((other) => (
      other.id !== row.id
      && samePinnedPoint(other, row)
      && !builtinTitles.has(foldPinnedQuery(other.title))
    )))
    .map((row) => row.id);
  if (duplicateIds.length) {
    await supabase.from('pinned_addresses').delete().in('id', duplicateIds);
  }
  const kept = valid.filter((row) => !duplicateIds.includes(row.id));
  const missing = PINNED_ADDRESSES.filter((item) => !kept.some((row) => (
    foldPinnedQuery(row.title) === foldPinnedQuery(item.title) || samePinnedPoint(row, item)
  )));
  if (!missing.length) return dedupePinnedRows(kept);
  const { data, error } = await supabase
    .from('pinned_addresses')
    .insert(missing.map((item) => ({ title: item.title, lat: item.lat, lng: item.lng })))
    .select('id, title, lat, lng');
  if (error) return withBuiltins(kept);
  return dedupePinnedRows([...kept, ...(data || [])]);
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
