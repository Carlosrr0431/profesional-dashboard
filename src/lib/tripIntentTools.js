import { getSupabaseAdmin } from './supabaseAdmin';
import {
  matchCatalogStreetPhrase,
  matchCatalogStreetClosestToEnd,
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
import {
  autocompleteAddressSalta,
  isGoogleConfigured,
  fixCommonPoiTypos,
} from '../../shared/geo/googlePlaces.js';
import { stripScheduleTimePhrases } from './whatsappTripAddressParse.js';

const TARIFF_KEYS = ['platform_tariff_per_km', 'platform_tariff_base'];
const OPEN_TRIP_STATUSES = ['scheduled', 'queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress'];

const BARRIO_ALIASES = [
  { re: /\btres\s+cerr(?:itos?)?\b/, label: 'Barrio Tres Cerritos, Salta' },
  { re: /\bgrand\s+bourg\b/, label: 'Barrio Grand Bourg, Salta' },
  { re: /\bcasta[nñ]ares\b/, label: 'Barrio Castañares, Salta' },
  { re: /\blimache\b/, label: 'Barrio Limache, Salta' },
  { re: /\bportezuelo\b/, label: 'Barrio Portezuelo, Salta' },
];

const EVENT_NOT_ADDRESS_RE = /\b(?:show|concierto|recital|obra(?:\s+de\s+teatro)?|partido)\s+de\b/;

function isPersonNameNotStreet(tokens, house) {
  if (house || tokens.length < 2 || tokens.length > 3) return false;
  const last = tokens[tokens.length - 1];
  const head = tokens.slice(0, -1);
  if (matchCatalogStreetPhrase(head)) return false;
  const lastStreet = matchCatalogStreetPhrase([last]);
  if (!lastStreet) return false;
  const full = matchCatalogStreetPhrase(tokens);
  return !full || full.nameKey === lastStreet.nameKey;
}

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
  const src = String(query || '');
  const afterStreetLong = src.match(
    /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.]{1,})*\s+(?:al\s+)?(\d{3,5})\b/i,
  );
  if (afterStreetLong) return afterStreetLong[1];
  const afterStreet = src.match(
    /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.]{1,})*\s+(?:al\s+)?(\d{1,5}[a-z]?)\b/i,
  );
  if (afterStreet) return afterStreet[1];
  const match = src.match(/\b(?:al\s+)?(\d{1,5}[a-z]?)(?:\s*[a-z])?\b/i);
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

  const query = normalizeAddressPhrase(
    sanitizeAddressInput(stripScheduleTimePhrases(fixCommonPoiTypos(original)) || original) || original,
  ) || original;
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

  if (VAGUE_PLACE_RE.test(folded)) {
    return {
      query,
      found: false,
      needs_gps: true,
      reason: 'vague_place',
      hint: 'Pedí calle y altura o ubicación GPS. No alcanza frente a / al lado de.',
    };
  }

  const house = extractHouseNumber(query);
  const tokens = streetTokens(query, house);
  const tokensForStreet = house
    ? streetTokens(String(query).split(new RegExp(`\\b${house}\\b`, 'i'))[0] || query, null)
    : tokens;
  if (EVENT_NOT_ADDRESS_RE.test(folded) && !house) {
    return { query, found: false, reason: 'event_not_address' };
  }
  if (isPersonNameNotStreet(tokensForStreet, house)) {
    return { query, found: false, reason: 'person_name' };
  }
  const street = house
    ? (matchCatalogStreetClosestToEnd(tokensForStreet) || matchCatalogStreetPhrase(tokensForStreet))
    : matchCatalogStreetPhrase(tokens);
  const preferStreetNumber = Boolean(street && house);
  const barrio = matchBarrio(query);

  if (barrio && !/\d/.test(query) && /\bbarrio\b/i.test(query)) {
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

  const poi = resolveSaltaKnownPoi(query);
  if (poi && !preferStreetNumber && !house) {
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

  const intersection = /\s+y\s+|\s+c\/\s+|\besq(?:uina)?\b|\bcasi\b/i.test(query);
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

const TRIP_FILLER_RE = /\b(buenas?(?:\s+(?:noches|tardes|dias?))?|hola|que\s+tal|me|puede(?:n|s)?|podrias?|podes|por\s+favor|porfa|mandame|manda(?:r|s)?|enviar|envia(?:me)?|necesito|quiero|pedido|te\s+pido|solicito|un|una|el|la|los|las|movil|remis|auto|coche|taxi)\b/gi;
const GOOGLE_HINT_SKIP = new Set([
  'salta', 'capital', 'argentina', 'sobre', 'frente', 'lado',
  'calle', 'avenida', 'avda',
]);

function googlePlaceQuery(query) {
  const cleaned = fold(query)
    .replace(TRIP_FILLER_RE, ' ')
    .replace(/[?¿!¡.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:al|a|en|para)\s+/, '');
  return cleaned || fold(query);
}

function leftoverPlaceTokens(query, local) {
  const house = extractHouseNumber(query);
  const tokens = streetTokens(googlePlaceQuery(query), house);
  const streetBits = fold(local?.canonical || local?.street_key || '')
    .replace(/\b(salta|capital)\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const skip = new Set([...CONNECTORS, 'salta', 'capital', 'sobre', 'frente', ...streetBits]);
  if (house) skip.add(fold(house));
  return tokens.filter((token) => token.length >= 3 && !skip.has(token));
}

function shouldTryGooglePlaces(local, rawQuery) {
  if (!isGoogleConfigured()) return false;
  if (!local) return false;
  if (local.reason === 'noise' || local.reason === 'here_or_home' || local.reason === 'vague_place') {
    return false;
  }
  if (local.homonym === 'guemes') return false;
  if (local.kind && local.kind !== 'street') return false;
  if (!local.found) return googlePlaceQuery(rawQuery).length >= 3;
  if (local.found && local.kind === 'street' && !local.needs_number) {
    return leftoverPlaceTokens(rawQuery, local).some((token) => (
      /monoblo|edificio|torre|shopping|hospital|hotel|escuela|colegio/.test(token)
    ));
  }
  return leftoverPlaceTokens(rawQuery, local).length > 0;
}

function optionBlob(option) {
  return fold(`${option.title || ''} ${option.subtitle || ''}`);
}

function queryHintTokens(query) {
  return googlePlaceQuery(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !GOOGLE_HINT_SKIP.has(token));
}

function pickGooglePlaceOption(query, options) {
  if (!options.length) return { picked: null, ambiguous: false };
  if (options.length === 1) return { picked: options[0], ambiguous: false };

  const uniqueHits = [];
  for (const hint of queryHintTokens(query)) {
    const matching = options.filter((option) => optionBlob(option).includes(hint));
    if (matching.length === 1) uniqueHits.push(matching[0]);
  }
  const unique = [...new Map(uniqueHits.map((option) => [option.placeId || option.subtitle, option])).values()];
  if (unique.length === 1) return { picked: unique[0], ambiguous: false };
  return { picked: null, ambiguous: true };
}

function googleCanonical(hit) {
  const title = String(hit?.title || hit?.poiName || '').trim();
  const subtitle = String(hit?.subtitle || '').trim();
  if (title && subtitle) return `${title}, ${subtitle}`;
  return withSalta(title);
}

function mapGoogleLookupOptions(hits) {
  return hits.map((hit) => ({
    title: hit.title || hit.poiName || '',
    subtitle: hit.subtitle || '',
    placeId: hit.placeId || null,
  }));
}

async function lookupAddressViaGooglePlaces(rawQuery) {
  const search = googlePlaceQuery(rawQuery);
  if (search.length < 3) return null;
  let hits = [];
  try {
    hits = await autocompleteAddressSalta(search, 6);
  } catch {
    return null;
  }
  if (!Array.isArray(hits) || hits.length === 0) return null;

  const options = mapGoogleLookupOptions(hits);
  const { picked, ambiguous } = pickGooglePlaceOption(rawQuery, options);
  const chosen = picked || options[0];
  const canonical = googleCanonical(picked || hits[0]);
  return {
    query: rawQuery,
    found: true,
    kind: 'google_place',
    canonical,
    needs_number: false,
    needs_gps: false,
    ambiguous: Boolean(ambiguous),
    homonym: null,
    options,
    hint: ambiguous
      ? 'Varias sedes en Maps. pickup=canonical; el sistema manda poll. No pongas pickup=null.'
      : 'Si el pasajero nombró una calle, canonical ya es esa sede.',
    geocode_query: chosen?.title || search,
  };
}

function googleKeepsHouseNumber(local, google) {
  const house = extractHouseNumber(local?.canonical || '');
  if (!house) return true;
  return fold(google?.canonical || '').includes(fold(house));
}

function googleImprovesCompleteStreet(local, google, rawQuery) {
  if (!google?.found) return false;
  if (!(local?.found && local.kind === 'street' && !local.needs_number)) return true;
  if (!googleKeepsHouseNumber(local, google)) return false;
  const leftover = leftoverPlaceTokens(rawQuery, local);
  const blob = fold(google.canonical);
  return leftover.some((token) => (
    /monoblo|edificio|torre|shopping|hospital|hotel|escuela|colegio/.test(token)
    || blob.includes(token)
  ));
}

export async function resolveLookupAddress(rawQuery) {
  const local = lookupAddress(rawQuery);
  if (!shouldTryGooglePlaces(local, rawQuery)) return local;
  const google = await lookupAddressViaGooglePlaces(rawQuery);
  if (!google?.found) return local;
  if (local.found && local.kind === 'street' && !local.needs_number) {
    return googleImprovesCompleteStreet(local, google, rawQuery) ? google : local;
  }
  return google;
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
    const { data: openTrip } = await db
      .from('trips')
      .select('id, status, origin_address, destination_address, created_at')
      .eq('passenger_phone', phone)
      .in('status', OPEN_TRIP_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = openTrip || (await db
      .from('trips')
      .select('id, status, origin_address, destination_address, created_at')
      .eq('passenger_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()).data;
    if (!row) return { found: false };
    return {
      found: true,
      open: OPEN_TRIP_STATUSES.includes(String(row.status || '').toLowerCase()),
      status: row.status,
      origin: row.origin_address || row.destination_address || null,
      destination: row.destination_address || null,
    };
  } catch {
    return { found: false, reason: 'lookup_failed' };
  }
}

export async function runTripIntentTool(name, args = {}, ctx = {}) {
  if (name === 'lookup_address') {
    return resolveLookupAddress(args.query || args.q || args.address || '');
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
