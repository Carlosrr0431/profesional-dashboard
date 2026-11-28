import { NextResponse } from 'next/server';
import { autocompleteAddressSalta, instantStreetSuggestions, keepLocatableSuggestions, searchGooglePlacesLastResort } from '../../../../src/lib/geo/index.js';
import { loadFrequentPlaces } from '../../../../src/lib/frequentTripCatalog';
import { mergePlaceSuggestions, searchFrequentPlaces } from '../../../../src/lib/frequentPickups';
import { searchCachedPlaces } from '../../../../src/lib/googlePlacesBudgetStore';
import { findSavedPinnedAddresses } from '../../../../src/lib/savedPinnedAddresses';
import {
  intersectionHitMatches,
  intersectionSearchLabel,
  parseStreetIntersection,
  pickPrimaryHouseNumber,
  alignStreetNumberPins,
} from '../../../../shared/salta-address.js';
import { rankNamedGoogleFirst } from '../../../../shared/geo/placeFreshness.js';
import { queryOverlapScore } from '../../../../shared/savedAddressMatch.js';
import { hasUsableGeoPoint, omitUnusablePin, preferSaltaCapitalFirst } from '../../../../shared/geo/mapConfig.js';

export const dynamic = 'force-dynamic';
/** La búsqueda ampliada (expand) explora por zonas y puede tardar varios segundos. */
export const maxDuration = 20;

const CACHE_TTL_MS = 45 * 1000;
const CACHE_MAX_ITEMS = 200;
const autocompleteCache = new Map();

function getCacheKey(query, limit, expand, near) {
  const nearKey = near ? `::near:${near.latitude.toFixed(3)},${near.longitude.toFixed(3)}` : '';
  return `${String(query || '').toLowerCase().replace(/\s+/g, ' ').trim()}::${limit}${expand ? '::expand' : ''}${nearKey}`;
}

function getCached(key) {
  const hit = autocompleteCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    autocompleteCache.delete(key);
    return null;
  }
  return hit.data;
}

function within(promise, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

function hasPin(item) {
  return hasUsableGeoPoint(item?.lat, item?.lng);
}

function dedupeSamePoint(items) {
  const kept = [];
  for (const item of items || []) {
    if (!hasPin(item)) {
      kept.push(item);
      continue;
    }
    const index = kept.findIndex((prev) => (
      hasPin(prev)
      && Math.abs(Number(prev.lat) - Number(item.lat)) < 0.00002
      && Math.abs(Number(prev.lng) - Number(item.lng)) < 0.00002
    ));
    if (index === -1) {
      kept.push(item);
      continue;
    }
    const prevSaved = String(kept[index].placeId || '').startsWith('saved:');
    const nextSaved = String(item.placeId || '').startsWith('saved:');
    if (nextSaved && !prevSaved) kept[index] = item;
  }
  return kept;
}

function withRequestedHouseNumber(items, query) {
  const wanted = pickPrimaryHouseNumber(query);
  if (wanted == null) return items || [];
  return (items || []).filter((item) => {
    const got = pickPrimaryHouseNumber(
      `${item?.title || ''} ${item?.subtitle || ''} ${item?.address || ''} ${item?.formattedAddress || ''}`,
    );
    return got === wanted;
  });
}

function canOffer(item) {
  if (hasPin(item)) return true;
  const id = String(item?.placeId || '');
  return id.startsWith('google:') || id.startsWith('street:');
}

function setCached(key, data) {
  autocompleteCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  if (autocompleteCache.size > CACHE_MAX_ITEMS) {
    const oldestKey = autocompleteCache.keys().next().value;
    if (oldestKey) autocompleteCache.delete(oldestKey);
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get('q') || '').trim();
    // expand=1: búsqueda ampliada por zonas (lugares con muchas sucursales). Solo la piden
    // los clientes que lo necesitan; el resto sigue con el tope de 8.
    const expand = searchParams.get('expand') === '1';
    const limit = Math.min(expand ? 60 : 8, Math.max(1, Number(searchParams.get('limit') || 5)));

    if (query.length < 2) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const sessionToken = String(searchParams.get('sessionToken') || '').trim() || undefined;

    // lat/lng opcionales (ubicación de quien busca): en expand ordenan por cercanía.
    const nearLat = Number(searchParams.get('lat'));
    const nearLng = Number(searchParams.get('lng'));
    const near = expand
      && searchParams.has('lat') && searchParams.has('lng')
      && Number.isFinite(nearLat) && Number.isFinite(nearLng)
      ? { latitude: nearLat, longitude: nearLng }
      : null;

    // Cache por texto + límite (sin sessionToken) para maximizar hit-rate.
    // Al devolver desde cache se re-inyecta el sessionToken del request actual
    // para que el Place Details posterior cierre correctamente la sesión activa.
    const cacheKey = getCacheKey(query, limit, expand, near);
    const cached = getCached(cacheKey);
    if (cached) {
      const data = sessionToken
        ? cached.map((item) => ({ ...item, sessionToken }))
        : cached;
      return NextResponse.json({ ok: true, data });
    }

    const intersection = parseStreetIntersection(query);
    const googleQuery = intersection ? intersectionSearchLabel(intersection) : query;
    const streets = intersection ? [] : instantStreetSuggestions(query, limit);
    if (streets.length) {
      const frequentPromise = loadFrequentPlaces()
        .then((list) => ({ ok: true, items: searchFrequentPlaces(list, query, limit) }))
        .catch(() => ({ ok: false, items: [] }));
      const [frequent, cachedPlaces, saved] = await Promise.all([
        within(frequentPromise, 80, { ok: false, items: [] }),
        within(searchCachedPlaces(query, limit), 80, []),
        within(findSavedPinnedAddresses(query).catch(() => []), 80, []),
      ]);
      const remembered = withRequestedHouseNumber(
        rankNamedGoogleFirst([...(cachedPlaces || []), ...(frequent?.items || [])], query),
        query,
      );
      let results = mergePlaceSuggestions(streets, remembered, limit);
      if (saved.length) {
        results = mergePlaceSuggestions(results, withRequestedHouseNumber(saved, query), limit);
      }
      results = dedupeSamePoint(results).map(omitUnusablePin);
      if (results.length) setCached(cacheKey, results);
      return NextResponse.json({ ok: true, data: results });
    }
    const frequentPromise = loadFrequentPlaces()
      .then((list) => ({ ok: true, items: searchFrequentPlaces(list, query, limit) }))
      .catch(() => ({ ok: false, items: [] }));
    const [frequent, cachedPlaces, geo, saved] = await Promise.all([
      within(frequentPromise, 160, { ok: false, items: [] }),
      within(searchCachedPlaces(query, limit), 160, []),
      within(
        autocompleteAddressSalta(query, limit, { sessionToken, expand, near }),
        280,
        [],
      ),
      within(findSavedPinnedAddresses(query).catch(() => []), 160, []),
    ]);
    let results;
    const remembered = withRequestedHouseNumber(
      rankNamedGoogleFirst([...(cachedPlaces || []), ...(frequent?.items || [])], query),
      query,
    );
    const localGeo = withRequestedHouseNumber(geo, query);
    if (intersection) {
      const pool = [...remembered, ...localGeo];
      results = pool.filter((item) => intersectionHitMatches(item, intersection.street1, intersection.street2)).slice(0, limit);
    } else if (pickPrimaryHouseNumber(query) != null) {
      results = mergePlaceSuggestions(localGeo, remembered, limit);
    } else {
      results = mergePlaceSuggestions(remembered, localGeo, limit);
    }
    if (saved.length) {
      results = mergePlaceSuggestions(withRequestedHouseNumber(saved, query), results, limit);
    }
    results = dedupeSamePoint(results);
    const wantedNumber = pickPrimaryHouseNumber(query);
    const cacheAlreadyAnswers = (results || []).some((item) => (
      canOffer(item) && (!intersection || intersectionHitMatches(item, intersection.street1, intersection.street2))
    ));
    const googleFast = cacheAlreadyAnswers
      ? []
      : await within(
        searchGooglePlacesLastResort(googleQuery, limit, { sessionToken }).catch(() => []),
        550,
        [],
      );
    const fresh = (googleFast || []).filter((item) => (
      canOffer(item) && (!intersection || intersectionHitMatches(item, intersection.street1, intersection.street2))
    ));
    const numberedFresh = wantedNumber == null ? fresh : withRequestedHouseNumber(fresh, query);
    const incoming = numberedFresh.length ? numberedFresh : (results.length ? [] : fresh);
    if (incoming.length) {
      results = preferSaltaCapitalFirst(incoming, query).slice(0, limit);
    } else if (!fresh.length) {
      results.sort((a, b) => (
        queryOverlapScore(query, `${b?.title || ''} ${b?.subtitle || ''} ${b?.address || ''} ${b?.formattedAddress || ''}`)
        - queryOverlapScore(query, `${a?.title || ''} ${a?.subtitle || ''} ${a?.address || ''} ${a?.formattedAddress || ''}`)
      ));
      results = preferSaltaCapitalFirst(results, query);
    }
    const hasGoogleList = fresh.length > 0 && results.some((item) => String(item?.placeId || '').startsWith('google:'));
    if (!hasGoogleList) {
      results = await within(
        keepLocatableSuggestions(results),
        180,
        (results || []).filter((item) => hasPin(item) || String(item?.placeId || '').startsWith('google:')),
      );
    }
    if (pickPrimaryHouseNumber(query) != null) {
      results = alignStreetNumberPins(results, query);
    }
    results = (results || []).map(omitUnusablePin);
    if (results.length) setCached(cacheKey, results);
    return NextResponse.json({ ok: true, data: results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error de búsqueda' },
      { status: 500 },
    );
  }
}
