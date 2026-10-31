const SALTA_LAT = { min: -26.8, max: -21.8 };
const SALTA_LNG = { min: -68.6, max: -62.4 };
const CELL_DEG = 0.008;
const TODAY_GROUP_METERS = 1400;
const WINDOW_MINUTES = 60;
const MAX_ZONES = 8;

const hourFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Salta',
  hour: '2-digit',
  hourCycle: 'h23',
});

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Salta',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Salta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const weekdayNameFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Salta',
  weekday: 'long',
});

export function isDemandCoord(lat, lng) {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= SALTA_LAT.min
    && lat <= SALTA_LAT.max
    && lng >= SALTA_LNG.min
    && lng <= SALTA_LNG.max;
}

export function saltaHour(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hour = Number(hourFormatter.format(date).replace(/\D/g, ''));
  if (!Number.isFinite(hour)) return null;
  return hour % 24;
}

export function saltaMinutes(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = clockFormatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return (hour % 24) * 60 + minute;
}

export function minuteDistance(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 1440;
  const diff = Math.abs(left - right);
  return Math.min(diff, 1440 - diff);
}

function formatClock(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function saltaHourLabel(now = Date.now()) {
  const hour = saltaHour(now);
  if (hour == null) return '';
  return `${String(hour).padStart(2, '0')} h`;
}

export function saltaHourWindowLabel(now = Date.now()) {
  const minutes = saltaMinutes(now);
  if (minutes == null) return '';
  return `${formatClock(minutes - WINDOW_MINUTES)} a ${formatClock(minutes + WINDOW_MINUTES)}`;
}

const SHIFT_START_HOURS = [22, 14, 6];

/** Turno de Salta en curso: 22 a 06, 06 a 14 o 14 a 22. */
export function saltaShift(now = Date.now()) {
  const minutes = saltaMinutes(now);
  if (minutes == null) return null;
  const hour = Math.floor(minutes / 60);
  const startHour = SHIFT_START_HOURS.find((start) => hour >= start) ?? 22;
  const endHour = (startHour + 8) % 24;
  const elapsedMinutes = (minutes - startHour * 60 + 1440) % 1440;
  const nowMs = new Date(now).getTime();
  return {
    startHour,
    endHour,
    startMs: nowMs - (nowMs % 60000) - elapsedMinutes * 60000,
    label: `Turno ${String(startHour).padStart(2, '0')} a ${String(endHour).padStart(2, '0')}`,
  };
}

const SCHEDULED_SEARCH_MS = 20 * 60 * 1000;

export function isScheduledSearching(iso, now = Date.now()) {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return false;
  return at - now <= SCHEDULED_SEARCH_MS;
}

export function isInDemandWindow(createdAt, now = Date.now()) {
  return minuteDistance(saltaMinutes(createdAt), saltaMinutes(now)) <= WINDOW_MINUTES;
}

export function saltaWeekday(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dateFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  if (![year, month, day].every(Number.isFinite)) return null;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function saltaWeekdayLabel(now = Date.now()) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) return '';
  return weekdayNameFormatter.format(date);
}

export function isSameSaltaWeekday(createdAt, now = Date.now()) {
  const tripDay = saltaWeekday(createdAt);
  const today = saltaWeekday(now);
  return tripDay != null && tripDay === today;
}

function saltaDateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dateFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  if (![year, month, day].every(Number.isFinite)) return null;
  return { year, month, day };
}

function dateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(parts, days) {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${next.getUTCFullYear()}-${next.getUTCMonth() + 1}-${next.getUTCDate()}`;
}

export function cleanTripNote(notes) {
  const text = String(notes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('[') && !/^destino final sugerido:/i.test(line))
    .join('\n')
    .trim();
  return text || '';
}

export function formatScheduledBadge(iso, now = Date.now()) {
  const whenParts = saltaDateParts(iso);
  const nowParts = saltaDateParts(now);
  const minutes = saltaMinutes(iso);
  if (!whenParts || !nowParts || minutes == null) return 'Programado';
  const whenKey = dateKey(whenParts);
  const todayKey = dateKey(nowParts);
  const tomorrowKey = shiftDateKey(nowParts, 1);
  const time = formatClock(minutes);
  if (whenKey === todayKey) return `Hoy ${time}`;
  if (whenKey === tomorrowKey) return `Mañana ${time}`;
  const shortDay = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Salta',
    weekday: 'short',
  }).format(new Date(iso)).replace('.', '');
  return `${shortDay} ${time}`;
}

function cellKey(lat, lng) {
  return `${Math.round(lat / CELL_DEG)}:${Math.round(lng / CELL_DEG)}`;
}

function demandWeight(row) {
  const weight = Number(row?.trip_count);
  return Number.isFinite(weight) && weight > 0 ? Math.round(weight) : 1;
}

function metersBetween(a, b) {
  const dLat = (a.lat - b.lat) * 111320;
  const dLng = (a.lng - b.lng) * 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLng);
}

function clusterNearby(seeds, maxMeters) {
  const groups = seeds.map((seed) => ({ ...seed }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        if (metersBetween(groups[i], groups[j]) > maxMeters) continue;
        const total = groups[i].score + groups[j].score;
        groups[i] = {
          lat: (groups[i].lat * groups[i].score + groups[j].lat * groups[j].score) / total,
          lng: (groups[i].lng * groups[i].score + groups[j].lng * groups[j].score) / total,
          score: total,
        };
        groups.splice(j, 1);
        merged = true;
        break;
      }
      if (merged) break;
    }
  }
  return groups.sort((a, b) => b.score - a.score);
}

function zoneLevel(score, maxScore) {
  if (maxScore <= 0) return 'baja';
  const ratio = score / maxScore;
  if (ratio >= 0.66) return 'alta';
  if (ratio >= 0.33) return 'media';
  return 'baja';
}

/**
 * Zonas según la hora actual de Salta.
 * El historial ya viene filtrado a esta hora. Los viajes del turno solo
 * refuerzan la zona si también cayeron en esa franja.
 * Los pines verdes son todos los viajes de la flota del turno en curso.
 */
export function summarizeDemand(rows, now = Date.now()) {
  const cells = new Map();
  const todayCells = new Map();
  const pins = [];
  const scheduled = [];
  const queued = [];
  const shift = saltaShift(now);
  let todayCount = 0;
  let historyCount = 0;

  for (const row of rows || []) {
    const lat = Number(row?.lat);
    const lng = Number(row?.lng);
    if (!isDemandCoord(lat, lng)) continue;

    const isScheduled = row?.kind === 'scheduled';
    if (isScheduled) {
      scheduled.push({
        lat,
        lng,
        at: row.created_at,
        label: formatScheduledBadge(row.created_at, now),
        clock: formatClock(saltaMinutes(row.created_at) || 0),
        pickup: String(row.pickup_address || '').trim(),
        destination: String(row.destination_address || '').trim(),
        note: cleanTripNote(row.note),
      });
      continue;
    }

    if (row?.kind === 'queued') {
      queued.push({ lat, lng, at: row.created_at });
      continue;
    }

    const isToday = row?.kind !== 'history';
    // Al cambiar de turno, lo del turno anterior sale antes del próximo refresco.
    if (isToday && shift && new Date(row?.created_at).getTime() < shift.startMs) continue;
    const weight = demandWeight(row);
    if (isToday) {
      todayCount += weight;
      pins.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [lng, lat] },
      });
      const todayKey = cellKey(lat, lng);
      const todayCell = todayCells.get(todayKey) || { lat: 0, lng: 0, points: 0 };
      todayCell.points += weight;
      todayCell.lat += lat * weight;
      todayCell.lng += lng * weight;
      todayCells.set(todayKey, todayCell);
    }

    if (!isInDemandWindow(row?.created_at, now)) continue;
    if (!isToday && !isSameSaltaWeekday(row?.created_at, now)) continue;
    if (!isToday) historyCount += weight;

    const key = cellKey(lat, lng);
    const cell = cells.get(key) || {
      lat: 0,
      lng: 0,
      points: 0,
      history: 0,
      today: 0,
    };
    cell.points += weight;
    cell.lat += lat * weight;
    cell.lng += lng * weight;
    if (isToday) cell.today += weight;
    else cell.history += weight;
    cells.set(key, cell);
  }

  const ranked = [...cells.values()]
    .map((cell) => ({
      lat: cell.lat / cell.points,
      lng: cell.lng / cell.points,
      history: cell.history,
      today: cell.today,
      score: cell.history + cell.today,
    }))
    .filter((zone) => zone.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ZONES);

  const todayZones = clusterNearby(
    [...todayCells.values()].map((cell) => ({
      lat: cell.lat / cell.points,
      lng: cell.lng / cell.points,
      score: cell.points,
    })),
    TODAY_GROUP_METERS,
  );

  scheduled.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const maxScore = ranked[0]?.score || 0;
  const zones = ranked.map((zone, index) => ({
    ...zone,
    rank: index + 1,
    level: zoneLevel(zone.score, maxScore),
  }));

  return {
    hourLabel: saltaHourLabel(now),
    shiftLabel: shift?.label || 'Turno',
    zones,
    zoneCollection: {
      type: 'FeatureCollection',
      features: zones.map((zone) => ({
        type: 'Feature',
        properties: { score: zone.score, level: zone.level },
        geometry: { type: 'Point', coordinates: [zone.lng, zone.lat] },
      })),
    },
    pins: { type: 'FeatureCollection', features: pins },
    todayZones,
    todayZoneCollection: {
      type: 'FeatureCollection',
      features: todayZones.map((zone) => ({
        type: 'Feature',
        properties: { score: zone.score },
        geometry: { type: 'Point', coordinates: [zone.lng, zone.lat] },
      })),
    },
    scheduled: scheduled.slice(0, 24),
    queued: queued.slice(0, 40),
    todayCount,
    historyCount,
  };
}

/** Vista inicial: centro de Salta Capital, con la ciudad entera a la vista. */
export const SALTA_CAPITAL_CAMERA = {
  center: [-65.411, -24.789],
  zoom: 12.6,
};

export function demandCameraTarget(features) {
  if (!features?.length) {
    return { center: [-65.4232, -24.7821], zoom: 12.5 };
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const feature of features) {
    const [lng, lat] = feature.geometry.coordinates;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const latSpan = Math.max(maxLat - minLat, 0.008);
  const zoom = Math.max(11, Math.min(14.5, Math.log2(0.42 / latSpan) + 12));
  return {
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    zoom,
  };
}
