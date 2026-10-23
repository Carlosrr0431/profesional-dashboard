import { isCoordLikeAddress, resolveTripPickupCoords } from '../../shared/trip-contract.js';

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

/** Retiros de viajes agrupados por lugar, del más pedido al menos pedido. */
export function buildFrequentPickups(trips = [], { isAllowed = () => true } = {}) {
  const groups = new Map();

  for (const trip of trips) {
    const pickup = resolveTripPickupCoords(trip);
    const address = String(pickup?.address || '').trim();
    const lat = Number(pickup?.lat);
    const lng = Number(pickup?.lng);
    if (!address || isCoordLikeAddress(address)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isAllowed(lat, lng)) continue;

    const key = pickupKey(address);
    if (!key) continue;
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
    const at = trip.created_at || null;
    if (at && (!bucket.lastAt || at > bucket.lastAt)) bucket.lastAt = at;
    const weekMinute = artWeekMinute(trip.scheduled_for || trip.created_at);
    if (weekMinute != null) bucket.times.push(weekMinute);
  }

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
