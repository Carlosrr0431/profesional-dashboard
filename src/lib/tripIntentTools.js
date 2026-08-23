import { getSupabaseAdmin } from './supabaseAdmin';
import {
  matchCatalogStreetPhrase,
  normalizeStreetKey,
} from '../../shared/salta-street-lookup.js';
import {
  resolveSaltaKnownPoi,
  isCategoryPoiSearch,
} from './saltaKnownPois';
import { isGuemesHomonymQuery, ambiguousGuemesSearchQuery } from './saltaStreetHomonyms';
import { isAddressNoisePhrase } from './whatsappTripIntentPatterns';
import {
  sanitizeAddressInput,
  normalizeAddressPhrase,
} from '../../shared/salta-address.js';
import { getRouteMetricsByAddress } from '../../shared/geo/osrm.js';

const TARIFF_KEYS = ['platform_tariff_per_km', 'platform_tariff_base'];
const OPEN_TRIP_STATUSES = ['pending', 'accepted', 'going_to_pickup', 'in_progress'];

const BARRIO_ALIASES = [
  { re: /\btres\s+cerr(?:itos?)?\b/, label: 'Barrio Tres Cerritos, Salta' },
  { re: /\bgrand\s+bourg\b/, label: 'Barrio Grand Bourg, Salta' },
  { re: /\bcasta[nñ]ares\b/, label: 'Barrio Castañares, Salta' },
  { re: /\blimache\b/, label: 'Barrio Limache, Salta' },
  { re: /\bportezuelo\b/, label: 'Barrio Portezuelo, Salta' },
];

const GPS_RE = /^(?:aca|aqui|donde\s+estoy|en\s+mi\s+casa|mismo\s+lugar(?:\s+de\s+siempre)?)$/i;
const NEEDS_GPS_RE = /\b(?:pasaje|pje\.?|callej[oó]n|manzana|mz\.?|lote|lt\.?)\b/i;
const VAGUE_PLACE_RE = /\b(?:frente\s+a|al\s+lado\s+de)\b/i;
const CONNECTORS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'a', 'al', 'en']);

function digitsPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withSalta(label) {
  const text = String(label || '').trim();
  if (!text) return null;
  return /salta/i.test(text) ? text : `${text}, Salta`;
}

function extractHouseNumber(query) {
  const match = String(query || '').match(/\b(?:al\s+)?(\d{1,5}[a-z]?)(?:\s*[a-z])?\b/i);
  return match ? match[1] : null;
}

function streetTokens(query, house) {
  let blob = fold(query)
    .replace(/\b(?:calle|avenida|avda|av\.?|pasaje|pje\.?)\b/g, ' ')
    .replace(/\bal\b/g, ' ');
  if (house) blob = blob.replace(new RegExp(`\\b${house}\\b`, 'i'), ' ');
  return blob
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !CONNECTORS.has(token));
}

function matchBarrio(query) {
  const n = fold(query);
  if (!n) return null;
  const hit = BARRIO_ALIASES.find((item) => item.re.test(n));
  return hit ? hit.label : null;
}

export function lookupAddress(rawQuery) {
  const original = String(rawQuery || '').trim();
  const foldedRaw = fold(original);
  if (GPS_RE.test(foldedRaw)) {
    return {
      query: original,
      found: false,
      needs_gps: true,
      reason: 'here_or_home',
      hint: 'Pedí ubicación GPS de WhatsApp o calle y altura. No uses historial.',
    };
  }

  const query = normalizeAddressPhrase(sanitizeAddressInput(original) || original) || original;
  const folded = fold(query);
  if (!folded || isAddressNoisePhrase(query) || isAddressNoisePhrase(folded)) {
    return { query: rawQuery || '', found: false, reason: 'noise' };
  }
  if (GPS_RE.test(folded)) {
    return {
      query,
      found: false,
      needs_gps: true,
      reason: 'here_or_home',
      hint: 'Pedí ubicación GPS de WhatsApp o calle y altura. No uses historial.',
    };
  }
  if (VAGUE_PLACE_RE.test(folded)) {
    return {
      query,
      found: false,
      needs_gps: true,
      reason: 'vague_place',
      hint: 'Pedí calle y altura o ubicación GPS. No alcanza frente a / al lado de.',
    };
  }

  const poi = resolveSaltaKnownPoi(query);
  if (poi) {
    const category = isCategoryPoiSearch(poi);
    return {
      query,
      found: true,
      kind: 'poi',
      canonical: poi.label || poi.geocodeQuery,
      geocode_query: poi.geocodeQuery || null,
      needs_number: false,
      needs_gps: false,
      ambiguous: Boolean(category),
      homonym: null,
    };
  }

  const barrio = matchBarrio(query);
  if (barrio && !/\d/.test(query)) {
    return {
      query,
      found: true,
      kind: 'barrio',
      canonical: barrio,
      needs_number: false,
      needs_gps: false,
      ambiguous: false,
      homonym: null,
    };
  }

  const house = extractHouseNumber(query);
  const tokens = streetTokens(query, house);
  const intersection = /\s+y\s+|\s+c\/\s+|\besq(?:uina)?\b/i.test(query);
  if (intersection) {
    const cleaned = withSalta(query.replace(/\s+c\/\s+/gi, ' y ').replace(/\besq(?:uina)?\.?\s+/gi, 'y '));
    return {
      query,
      found: true,
      kind: 'intersection',
      canonical: cleaned,
      needs_number: false,
      needs_gps: false,
      ambiguous: false,
      homonym: null,
    };
  }

  const street = matchCatalogStreetPhrase(tokens);
  const guemes = isGuemesHomonymQuery(query, tokens);
  if (guemes) {
    return {
      query,
      found: true,
      kind: 'street',
      canonical: ambiguousGuemesSearchQuery(house ? `Güemes ${house}` : 'Güemes'),
      needs_number: !house,
      needs_gps: false,
      ambiguous: true,
      homonym: 'guemes',
      hint: 'No expandas a Gral/Martín/Adolfo. El sistema manda el poll.',
    };
  }

  if (NEEDS_GPS_RE.test(folded)) {
    return {
      query,
      found: true,
      kind: 'unofficial',
      canonical: withSalta(query),
      needs_number: false,
      needs_gps: true,
      ambiguous: false,
      homonym: null,
      hint: 'Pasaje/manzana/lote: el sistema pedirá GPS.',
    };
  }

  if (!street) {
    return { query, found: false, reason: 'unknown_street' };
  }

  const name = street.name;
  const canonical = house ? withSalta(`${name} ${house}`) : withSalta(name);
  return {
    query,
    found: true,
    kind: 'street',
    canonical,
    street_key: street.nameKey || normalizeStreetKey(name),
    needs_number: !house,
    needs_gps: false,
    ambiguous: Boolean(street.ambiguous),
    homonym: null,
  };
}

export async function loadTripIntentSettings(existing) {
  if (existing && typeof existing === 'object') return existing;
  try {
    const db = getSupabaseAdmin();
    const { data } = await db.from('settings').select('key, value').in('key', TARIFF_KEYS);
    return Object.fromEntries((data || []).map((row) => [row.key, row.value]));
  } catch {
    return {};
  }
}

async function quoteFare(args = {}, settingsMap = {}) {
  const origin = String(args.origin || args.pickup || '').trim();
  const destination = String(args.destination || '').trim();
  if (!origin || !destination) {
    return { priced: false, reason: 'need_both_addresses', origin: origin || null, destination: destination || null };
  }

  let route;
  try {
    route = await getRouteMetricsByAddress(origin, destination);
  } catch (err) {
    return { priced: false, reason: err?.message || 'route_failed', origin, destination };
  }

  const distanceKm = Number(route?.distanceKm);
  if (!Number.isFinite(distanceKm)) {
    return { priced: false, reason: 'no_distance', origin, destination };
  }

  const tariffPerKm = Number(settingsMap.platform_tariff_per_km || 0);
  const tariffBase = Number(settingsMap.platform_tariff_base || 0);
  const price = Math.round(tariffBase + tariffPerKm * distanceKm);
  return {
    priced: tariffPerKm > 0 || tariffBase > 0,
    origin: route.originResolved || origin,
    destination: route.destinationResolved || destination,
    distance_km: distanceKm,
    duration_minutes: route.durationMinutes ?? null,
    price: tariffPerKm > 0 || tariffBase > 0 ? price : null,
    tariff_base: tariffBase,
    tariff_per_km: tariffPerKm,
  };
}

async function getServiceStatus() {
  try {
    const db = getSupabaseAdmin();
    const { count, error } = await db
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('is_online', true);
    if (error) {
      return { in_service: true, online_drivers: null, note: 'Se puede tomar el pedido igual.' };
    }
    return {
      in_service: true,
      online_drivers: Number(count) || 0,
      note: 'Se puede tomar el pedido igual. Pedí calle y altura o GPS. No inventes que están cerrados.',
    };
  } catch {
    return { in_service: true, online_drivers: null, note: 'Se puede tomar el pedido igual.' };
  }
}

async function getTripStatus(ctx = {}) {
  const phone = digitsPhone(ctx.phone);
  if (!phone) return { found: false, reason: 'no_phone' };
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('trips')
      .select('id, status, origin_address, destination_address, created_at')
      .eq('passenger_phone', phone)
      .in('status', OPEN_TRIP_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { found: false };
    return {
      found: true,
      status: data.status,
      origin: data.origin_address || null,
      destination: data.destination_address || null,
    };
  } catch {
    return { found: false, reason: 'lookup_failed' };
  }
}

export async function runTripIntentTool(name, args = {}, ctx = {}) {
  if (name === 'lookup_address') {
    return lookupAddress(args.query || args.q || args.address || '');
  }
  if (name === 'quote_fare') {
    return quoteFare(args, await loadTripIntentSettings(ctx.settings));
  }
  if (name === 'get_service_status') {
    return getServiceStatus();
  }
  if (name === 'get_trip_status') {
    return getTripStatus(ctx);
  }
  return { error: `unknown_tool:${name}` };
}
