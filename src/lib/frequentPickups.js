import {
  isCoordLikeAddress,
  locationsMatch,
  resolveTripFinalDestCoords,
  resolveTripPickupCoords,
} from '../../shared/trip-contract.js';

/** Misma calle y altura a más de esta distancia es otro lugar (p. ej. calle y pasaje homónimos). */
const SAME_PLACE_METERS = 150;

const NOISE_WORDS = /\b(?:av|avda|avenida|gral|grl|general|pje|psje|pasaje|dr|doctor|cnel|coronel|calle|salta|capital|argentina|provincia|n|nro|numero)\b/g;
const CITY_PART = /^(?:[a-z]\d{4}[a-z]{0,3}\s+)?(?:salta(?: capital)?|capital|argentina|provincia de salta)$/;
const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
const ART_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const WEEKDAY_PLURALS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** Minuto de la semana en hora argentina: domingo 00:00 = 0, sábado 23:59 = 10079. */
export function artWeekMinute(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(ART_CLOCK.formatToParts(date).map((part) => [part.type, part.value]));
  return WEEKDAYS.indexOf(parts.weekday) * 1440 + (Number(parts.hour) % 24) * 60 + Number(parts.minute);
}

export function foldText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function addressParts(address) {
  return String(address || '')
    .replace(/\([^)]*\)/g, ' ')
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function cleanPart(part) {
  return foldText(part)
    .replace(/\b[a-z]\d{4}[a-z]{0,3}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(NOISE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clave de lugar: calle + altura, esquina ordenada o el nombre si no hay altura. */
export function pickupKey(address) {
  const parts = addressParts(address);
  for (const part of parts) {
    const folded = foldText(part);
    if (/\s(?:&|y)\s/.test(folded)) {
      const streets = folded.split(/\s+(?:&|y)\s+/).map(cleanPart).filter(Boolean);
      if (streets.length === 2) return streets.sort().join(' & ');
    }
    const cleaned = cleanPart(part);
    if (/\b\d{1,5}\b/.test(cleaned)) return cleaned;
  }
  return cleanPart(parts.join(' '));
}

function metersBetween(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function topEntry(map, tieBreak = () => 0) {
  let best = null;
  for (const [value, count] of map) {
    if (!best || count > best.count || (count === best.count && tieBreak(value, best.value) > 0)) {
      best = { value, count };
    }
  }
  return best?.value;
}

function ingestPlace(groups, address, lat, lng, at, weekMinute) {
  const key = pickupKey(address);
  if (!key) return;
  const buckets = groups.get(key) || [];
  let bucket = buckets.find((item) => metersBetween(item, { lat, lng }) <= SAME_PLACE_METERS);
  if (!bucket) {
    bucket = { key, lat, lng, count: 0, lastAt: null, labels: new Map(), points: new Map(), times: [] };
    buckets.push(bucket);
    groups.set(key, buckets);
  }

  bucket.count += 1;
  bucket.labels.set(address, (bucket.labels.get(address) || 0) + 1);
  const pointKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  bucket.points.set(pointKey, (bucket.points.get(pointKey) || 0) + 1);
  if (at && (!bucket.lastAt || at > bucket.lastAt)) bucket.lastAt = at;
  if (weekMinute != null) bucket.times.push(weekMinute);
}

function rememberPlace(groups, point, at, weekMinute, isAllowed) {
  const address = String(point?.address || '').trim();
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!address || isCoordLikeAddress(address)) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isAllowed(lat, lng)) return;
  ingestPlace(groups, address, lat, lng, at, weekMinute);
}

function listFromGroups(groups) {
  const list = [];
  for (const buckets of groups.values()) {
    buckets.forEach((bucket, index) => {
      const address = topEntry(bucket.labels, (a, b) => a.length - b.length);
      const [lat, lng] = topEntry(bucket.points).split(',').map(Number);
      const terms = [...new Set(
        [...bucket.labels.keys()].flatMap((label) => foldText(label).split(/[^a-z0-9]+/)).filter(Boolean),
      )].join(' ');
      list.push({
        id: `${bucket.key}#${index}`,
        address,
        lat,
        lng,
        count: bucket.count,
        lastAt: bucket.lastAt,
        times: bucket.times.sort((a, b) => a - b),
        terms,
      });
    });
  }
  return list.sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt)));
}

/** Retiros de viajes agrupados por lugar, del más pedido al menos pedido. */
export function buildFrequentPickups(trips = [], { isAllowed = () => true } = {}) {
  const groups = new Map();
  for (const trip of trips) {
    const at = trip.created_at || null;
    const weekMinute = artWeekMinute(trip.scheduled_for || trip.created_at);
    rememberPlace(groups, resolveTripPickupCoords(trip), at, weekMinute, isAllowed);
  }
  return listFromGroups(groups);
}

/** Retiro y destino de cada viaje: calles, pasajes y lugares que de verdad se pidieron. */
export function buildFrequentPlaces(trips = [], { isAllowed = () => true } = {}) {
  const groups = new Map();
  for (const trip of trips) {
    const at = trip.created_at || null;
    const weekMinute = artWeekMinute(trip.scheduled_for || trip.created_at);
    const pickup = resolveTripPickupCoords(trip);
    rememberPlace(groups, pickup, at, weekMinute, isAllowed);
    const dest = resolveTripFinalDestCoords(trip);
    if (dest && !locationsMatch(pickup, dest)) {
      rememberPlace(groups, dest, at, weekMinute, isAllowed);
    }
  }
  return listFromGroups(groups);
}

const SEARCH_STOP = new Set([
  'salta', 'capital', 'argentina', 'av', 'avda', 'avenida', 'calle',
  'de', 'del', 'la', 'las', 'los', 'el', 'y',
]);
const PASAJE_WORDS = new Set(['pje', 'psje', 'pasaje']);
const TYPO_WORDS = {
  shoping: 'shopping',
  shopingk: 'shopping',
  hospitak: 'hospital',
  bernado: 'bernardo',
};

function searchWords(value) {
  return foldText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function tokenMatches(token, words) {
  if (/^\d+$/.test(token) || token.length < 4) return words.includes(token);
  return words.some((word) => word === token || word.startsWith(token));
}

function isPasajeText(value) {
  return searchWords(value).some((word) => PASAJE_WORDS.has(word));
}

function placeSuggestion(place) {
  const parts = String(place.address || '').split(',').map((part) => part.trim()).filter(Boolean);
  const title = parts[0] || place.address;
  const subtitle = parts.slice(1).join(', ');
  return {
    address: subtitle ? `${title}, ${subtitle}` : title,
    placeId: `freq:${place.id}`,
    lat: place.lat,
    lng: place.lng,
    title,
    subtitle,
  };
}

/**
 * Lugares pedidos que coinciden con lo escrito.
 * La altura tiene que ser la misma. "pasaje" no devuelve la calle homónima.
 */
export function searchFrequentPlaces(list = [], query = '', limit = 6) {
  const tokens = searchWords(query).map((token) => TYPO_WORDS[token] || token);
  if (!tokens.length) return [];
  const height = /^\d{1,5}$/.test(tokens[tokens.length - 1]) ? tokens[tokens.length - 1] : null;
  const wantsPasaje = tokens.some((token) => PASAJE_WORDS.has(token));
  const content = tokens.filter((token) => token !== height && !SEARCH_STOP.has(token) && !PASAJE_WORDS.has(token));
  if (!content.length && !height) return [];

  const hits = [];
  for (const place of list) {
    const blob = `${place.address || ''} ${place.terms || ''}`;
    const words = searchWords(blob);
    const pasaje = isPasajeText(blob);
    if (wantsPasaje && !pasaje) continue;
    if (height && !words.includes(height)) continue;
    if (content.some((token) => !tokenMatches(token, words))) continue;
    hits.push({ place, pasaje });
  }

  hits.sort((a, b) => {
    if (height && !wantsPasaje && a.pasaje !== b.pasaje) return a.pasaje ? 1 : -1;
    return b.place.count - a.place.count;
  });

  return hits.slice(0, limit).map(({ place }) => placeSuggestion(place));
}

/** Primero los lugares de viajes ya hechos; el resto entra si no es el mismo punto. */
export function mergePlaceSuggestions(primary = [], extra = [], limit = 6) {
  const out = [];
  const seen = [];
  const take = (item) => {
    if (!item || out.length >= limit) return;
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    const text = foldText(item.address || item.title || '');
    const dup = seen.some((prev) => {
      if (text && text === prev.text) return true;
      if (!Number.isFinite(lat) || !Number.isFinite(prev.lat)) return false;
      return Math.abs(lat - prev.lat) < 0.0004 && Math.abs(lng - prev.lng) < 0.0004;
    });
    if (dup) return;
    seen.push({ text, lat, lng });
    out.push(item);
  };
  primary.forEach(take);
  extra.forEach(take);
  return out;
}

/** Franja alrededor de la hora actual; cada viaje pesa más cuanto más cerca de esta hora. */
export const PICKUP_WINDOW_MINUTES = 60;
/** Con pocas semanas de historia, solo el mismo día de semana acierta la mitad: se suma, no se filtra. */
export const SAME_WEEKDAY_WEIGHT = 1.5;

function minutesApart(a, b) {
  const diff = Math.abs(a - b) % 1440;
  return Math.min(diff, 1440 - diff);
}

/** Primero los retiros pedidos cerca de esta hora (más si fue el mismo día de semana), después el resto por total. */
export function rankPickupsForTime(list = [], weekMinute, windowMinutes = PICKUP_WINDOW_MINUTES) {
  const weekday = Math.floor(weekMinute / 1440);
  return list
    .map((item) => {
      let hourCount = 0;
      let dayCount = 0;
      let score = 0;
      for (const time of item.times || []) {
        const gap = minutesApart(time, weekMinute);
        if (gap > windowMinutes) continue;
        const sameDay = Math.floor(time / 1440) === weekday;
        hourCount += 1;
        if (sameDay) dayCount += 1;
        score += (1 - gap / windowMinutes) * (sameDay ? SAME_WEEKDAY_WEIGHT : 1);
      }
      return { item, hourCount, dayCount, score };
    })
    .sort((a, b) => (
      b.score - a.score
      || b.item.count - a.item.count
      || String(b.item.lastAt).localeCompare(String(a.item.lastAt))
    ))
    .map(({ item, hourCount, dayCount }) => ({ ...item, hourCount, dayCount }));
}

export function formatArtMinute(minute) {
  const value = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

/** Todas las palabras tienen que aparecer (sin acentos, en cualquier orden). Mantiene el orden recibido. */
export function filterPickups(list = [], query = '', limit = 80) {
  const tokens = foldText(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokens.length) return list.slice(0, limit);
  const matches = [];
  for (const item of list) {
    const haystack = item.terms || foldText(item.address);
    if (tokens.every((token) => haystack.includes(token))) {
      matches.push(item);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

function softenCaps(text) {
  if (text !== text.toUpperCase() || !/[A-ZÁÉÍÓÚÑ]{3}/.test(text)) return text;
  return text.toLowerCase().replace(/\S+/g, (word, offset) => (
    offset > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
  ));
}

/**
 * Media real ≈ 2.45 viajes/lugar. Con 2 el mapa se llena de casualidades (737 pines).
 * Con 3 quedan ~437 lugares que concentran el 62% de los retiros: un patrón, no un caso.
 */
export const MAP_PICKUP_MIN_COUNT = 3;

export function selectMapPickups(list = [], minCount = MAP_PICKUP_MIN_COUNT) {
  return list.filter((item) => (
    Number(item.count) >= minCount
    && Number.isFinite(Number(item.lat))
    && Number.isFinite(Number(item.lng))
  ));
}

const PLACE_WORD = /^(?:hospital|sanatorio|clinica|escuela|colegio|universidad|hotel|hostal|terminal|plaza|shopping|supermercado|farmacia|iglesia|catedral|parroquia|casino|residencial|barrio|parque|club|instituto|ministerio|municipalidad|banco|estacion|aeropuerto|cementerio)\b/;
const PLACE_CUT = /\s+(?:\||-|–|—)\s+|\s+affiliated\b/i;

function isStreetPart(part) {
  const folded = foldText(part);
  if (PLACE_WORD.test(folded)) return false;
  if (/\s(?:&|y)\s/.test(folded)) return true;
  return /\b\d{1,5}[a-z]?\b/.test(folded);
}

function clipCaption(text, max = 32) {
  const clean = String(text || '').split(PLACE_CUT)[0].replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const word = slice.lastIndexOf(' ');
  return `${(word > 14 ? slice.slice(0, word) : slice).trim()}…`;
}

/** Calle y altura si la dirección es eso; si es un lugar (hospital, escuela, comercio), el nombre del lugar. */
export function mapPickupCaption(address) {
  const { title, detail } = formatPickupLabel(address);
  const parts = [title, ...String(detail || '').split(', ')].map((part) => part.trim()).filter(Boolean);
  const place = parts.find((part) => !isStreetPart(part));
  const street = parts.find((part) => isStreetPart(part));
  return clipCaption(place || street || title || '');
}

/** Lado estable para que dos puntos vecinos no estiren el texto hacia el mismo lado. */
export function mapPickupLabelSide(lat, lng) {
  const col = Math.round(Number(lng) * 5000);
  const row = Math.round(Number(lat) * 5000);
  return ((col + row) & 1) === 0 ? 'right' : 'left';
}

/** Una sola pastilla: el número va adentro, junto a la dirección. */
export function pickupChipSize(count, caption) {
  const digits = String(Math.max(0, Math.round(Number(count) || 0))).length;
  const badge = digits >= 3 ? 30 : digits === 2 ? 24 : 20;
  const text = Math.min(200, Math.max(40, Math.ceil(String(caption || '').length * 6.7)));
  const pad = 8;
  const gap = 6;
  return { badge, text, pad, gap, width: pad + badge + gap + text + pad, height: 28 };
}

export function pickupLabelBox(x, y, caption, side, count = 1) {
  const { width, height } = pickupChipSize(count, caption);
  const left = side === 'right' ? x : x - width;
  return { x: left, y: y - height / 2, w: width, h: height };
}

function boxesOverlap(a, b, gap = 8) {
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y;
}

/** Qué puntos muestran texto: primero los más pedidos, y nunca uno encima de otro. */
export function layoutPickupLabels(points = [], { selectedId = null } = {}) {
  const ordered = [...points].sort((a, b) => (
    (Number(b.pickup?.count) || 0) - (Number(a.pickup?.count) || 0)
    || String(a.pickup?.id).localeCompare(String(b.pickup?.id))
  ));
  const boxes = [];
  const labeled = new Set();
  for (const point of ordered) {
    const box = pickupLabelBox(point.x, point.y, point.caption, point.side, point.pickup?.count);
    const forced = point.pickup?.id != null && point.pickup.id === selectedId;
    if (forced || !boxes.some((other) => boxesOverlap(other, box))) {
      labeled.add(point.pickup.id);
      boxes.push(box);
    }
  }
  return labeled;
}

/** "AV GRL BELGRANO 1668, Salta" → { title: "Av Grl Belgrano 1668", detail: "" } */
export function formatPickupLabel(address) {
  const parts = [];
  for (const part of addressParts(address)) {
    if (CITY_PART.test(foldText(part))) continue;
    if (parts.some((prev) => pickupKey(prev) === pickupKey(part))) continue;
    parts.push(softenCaps(part));
  }
  return { title: parts[0] || String(address || '').trim(), detail: parts.slice(1).join(', ') };
}
