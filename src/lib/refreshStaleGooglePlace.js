import { createRequire } from 'module';
import { isWithinServiceArea } from './constants';
import { getSupabaseAdmin } from './supabaseAdmin';
import { searchGooglePlacesLastResort } from './geo/index.js';
import {
  removeCachedGooglePlace,
  searchCachedPlaces,
  upsertCachedGooglePlace,
} from './googlePlacesBudgetStore';
import {
  isRefreshableGooglePlace,
  placeMoved,
  placeNeedsRefresh,
  titleMatchesQuery,
} from '../../shared/geo/placeFreshness.js';

const require = createRequire(import.meta.url);
const { fetchPlaceDetailsEssentials } = require('../../shared/geo/googlePlaces.js');

const DETAILS_TABLE = 'google_place_details_cache';
const POI_TABLE = 'google_places_poi_cache';
const inFlight = new Map();

function normalizePlaceId(placeId) {
  const id = String(placeId || '').trim();
  if (!id) return '';
  if (id.startsWith('google:')) return id;
  return '';
}

async function loadCachedPlace(placeId) {
  const supabase = getSupabaseAdmin();
  const details = await supabase
    .from(DETAILS_TABLE)
    .select('place_id, title, subtitle, formatted_address, lat, lng, types, updated_at')
    .eq('place_id', placeId)
    .maybeSingle();
  if (!details.error && details.data) return details.data;

  const poi = await supabase
    .from(POI_TABLE)
    .select('place_id, title, subtitle, formatted_address, lat, lng, types, updated_at')
    .eq('place_id', placeId)
    .maybeSingle();
  if (!poi.error && poi.data) return poi.data;
  return null;
}

function asSuggestion(details, row) {
  return {
    placeId: details.placeId,
    title: details.title || row?.title || null,
    subtitle: details.subtitle || row?.subtitle || null,
    formattedAddress: details.formattedAddress || row?.formatted_address || null,
    lat: details.lat,
    lng: details.lng,
    types: details.types?.length ? details.types : (row?.types || []),
  };
}

function pickReplacement(results, oldId, name) {
  return (results || []).find((item) => {
    const placeId = String(item?.placeId || '');
    return placeId.startsWith('google:')
      && placeId !== oldId
      && Number.isFinite(Number(item?.lat))
      && Number.isFinite(Number(item?.lng))
      && titleMatchesQuery(item?.title, name);
  }) || null;
}

async function findReplacement(title, oldId) {
  const name = String(title || '').trim();
  if (name.length < 4) return null;
  const cached = await searchCachedPlaces(name, 5).catch(() => []);
  const known = pickReplacement(cached, oldId, name);
  if (known) return known;
  const results = await searchGooglePlacesLastResort(name, 5, {
    skipSavedSearch: true,
    skipKnownPlaces: true,
  }).catch(() => []);
  return pickReplacement(results, oldId, name);
}

async function refreshOnce({ placeId, title }) {
  const id = normalizePlaceId(placeId);
  if (!id) return { status: 'skip' };

  const row = await loadCachedPlace(id).catch(() => null);
  if (!row) return { status: 'skip' };
  if (!isRefreshableGooglePlace({
    placeId: id,
    types: row.types,
    title: row.title || title,
  })) {
    return { status: 'skip' };
  }
  if (!placeNeedsRefresh(row.updated_at)) return { status: 'fresh' };

  try {
    const details = await fetchPlaceDetailsEssentials(id.replace(/^google:/, ''), {
      title: row.title || title,
      subtitle: row.subtitle,
      formattedAddress: row.formatted_address,
    });
    const suggestion = asSuggestion(details, row);
    await upsertCachedGooglePlace(suggestion).catch(() => null);
    if (suggestion.placeId && suggestion.placeId !== id) {
      await removeCachedGooglePlace(id).catch(() => null);
    }
    return {
      status: placeMoved(row.lat, row.lng, suggestion.lat, suggestion.lng) ? 'moved' : 'confirmed',
      ...suggestion,
    };
  } catch (err) {
    if (err?.code !== 'PLACE_NOT_FOUND') return { status: 'fresh' };
    await removeCachedGooglePlace(id).catch(() => null);
    const replacement = await findReplacement(row.title || title, id);
    if (!replacement) return { status: 'retired' };
    return {
      status: 'replaced',
      placeId: replacement.placeId,
      title: replacement.title || row.title || null,
      subtitle: replacement.subtitle || null,
      formattedAddress: replacement.formattedAddress || replacement.address || null,
      lat: Number(replacement.lat),
      lng: Number(replacement.lng),
      types: replacement.types || [],
    };
  }
}

export async function refreshStaleGooglePlace(input) {
  const id = normalizePlaceId(input?.placeId);
  if (!id) return { status: 'skip' };
  if (inFlight.has(id)) return inFlight.get(id);

  const pending = refreshOnce(input).catch(() => ({ status: 'skip' }));
  inFlight.set(id, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(id);
  }
}

/** Si el local se mudó, el viaje usa el punto nuevo. Si la ficha está al día, no llama a Google. */
export async function freshGoogleLocation(location, placeId) {
  if (!location || !String(placeId || '').startsWith('google:')) return location;
  const result = await refreshStaleGooglePlace({
    placeId,
    title: location.formattedAddress,
  });
  if (result?.status !== 'moved' && result?.status !== 'replaced') return location;
  const lat = Number(result.lat);
  const lng = Number(result.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isWithinServiceArea(lat, lng)) return location;
  return {
    formattedAddress: result.formattedAddress || location.formattedAddress,
    lat,
    lng,
  };
}
