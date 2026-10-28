import { NextResponse } from 'next/server';
import { autocompleteAddressSalta, keepLocatableSuggestions, searchGooglePlacesLastResort } from '../../../../src/lib/geo/index.js';
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
  return Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng));
}

function canOffer(item) {
  if (hasPin(item)) return true;
  return String(item?.placeId || '').startsWith('google:');
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
    const frequentPromise = loadFrequentPlaces()
      .then((list) => ({ ok: true, items: searchFrequentPlaces(list, query, limit) }))
      .catch(() => ({ ok: false, items: [] }));
    const [frequent, cachedPlaces, geo] = await Promise.all([
      within(frequentPromise, 350, { ok: false, items: [] }),
      within(searchCachedPlaces(query, limit), 350, []),
      within(
        autocompleteAddressSalta(query, limit, { sessionToken, expand, near }),
        intersection ? 280 : 1200,
        [],
      ),
    ]);
    let results;
    const remembered = rankNamedGoogleFirst([...(cachedPlaces || []), ...(frequent?.items || [])], query);
    if (intersection) {
      const pool = [...remembered, ...(geo || [])];
      results = pool.filter((item) => intersectionHitMatches(item, intersection.street1, intersection.street2)).slice(0, limit);
    } else {
      results = mergePlaceSuggestions(remembered, geo, limit);
    }
    results = await within(
      keepLocatableSuggestions(results),
      900,
      (results || []).filter(hasPin),
    );
    const saved = await findSavedPinnedAddresses(query).catch(() => []);
    if (saved.length) {
      results = mergePlaceSuggestions(saved, results, limit);
    }
    if (intersection) {
      if (!results.length) {
        const google = await searchGooglePlacesLastResort(intersectionSearchLabel(intersection), limit, { sessionToken }).catch(() => []);
        const fresh = google.filter((item) => intersectionHitMatches(item, intersection.street1, intersection.street2) && canOffer(item));
        results = mergePlaceSuggestions(results, fresh, limit);
      }
    } else if (!results.some(hasPin) && query.length >= 5) {
      const google = await searchGooglePlacesLastResort(query, limit, { sessionToken }).catch(() => []);
      results = mergePlaceSuggestions(results, google.filter(canOffer), limit);
    }
    if (pickPrimaryHouseNumber(query) != null) {
      results = alignStreetNumberPins(results, query);
    }
    results.sort((a, b) => (
      queryOverlapScore(query, `${b?.title || ''} ${b?.subtitle || ''} ${b?.address || ''} ${b?.formattedAddress || ''}`)
      - queryOverlapScore(query, `${a?.title || ''} ${a?.subtitle || ''} ${a?.address || ''} ${a?.formattedAddress || ''}`)
    ));
    if (results.length) setCached(cacheKey, results);
    return NextResponse.json({ ok: true, data: results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error de búsqueda' },
      { status: 500 },
    );
  }
}
