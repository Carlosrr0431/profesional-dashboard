import { isDemandCoord, saltaShift } from './demandHeatmap';

const SALTA_TZ = 'America/Argentina/Salta';

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickupFromNotes(notes) {
  const block = String(notes || '').match(/\[PICKUP_JSON:(\{[^}]*)/);
  if (!block) return { lat: null, lng: null };
  const lat = num((block[1].match(/"lat"\s*:\s*(-?[0-9.]+)/) || [])[1]);
  const lng = num((block[1].match(/"lng"\s*:\s*(-?[0-9.]+)/) || [])[1]);
  return { lat, lng };
}

function scheduledInstant(trip) {
  if (trip?.scheduled_for) {
    const at = new Date(trip.scheduled_for);
    if (!Number.isNaN(at.getTime())) return at;
  }
  const match = String(trip?.notes || '').match(
    /\[SCHEDULED_FOR\]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(?:Z|[+-][0-9:]{2,5})?)/,
  );
  if (!match) return null;
  const at = new Date(match[1]);
  return Number.isNaN(at.getTime()) ? null : at;
}

function isShownScheduled(notes) {
  const text = String(notes || '');
  return /\[SCHEDULED_SOURCE\] passenger_app/i.test(text)
    || /\[SCHEDULED_SOURCE\] passenger_web/i.test(text)
    || /\[SCHEDULED_SOURCE\] dashboard/i.test(text)
    || /\[DASHBOARD\]/i.test(text)
    || (/\[PASSENGER_APP\]/i.test(text) && !/\[SCHEDULED_SOURCE\] whatsapp/i.test(text));
}

function fleetPoint(trip) {
  const notes = String(trip?.notes || '');
  const fromNotes = pickupFromNotes(notes);
  const originLat = num(trip?.origin_lat);
  const originLng = num(trip?.origin_lng);
  const destLat = num(trip?.destination_lat);
  const destLng = num(trip?.destination_lng);
  const boarded = trip?.status === 'in_progress' || trip?.status === 'completed';
  const approach = /\[APPROACH_ONLY\]/i.test(notes) || /creado automaticamente desde whatsapp/i.test(notes);
  const streetHail = /\[STREET_HAIL\]/i.test(notes);
  const hasFinal = /\[FINAL_DEST_JSON:/i.test(notes);

  if (fromNotes.lat != null && fromNotes.lng != null) return fromNotes;
  if (streetHail && originLat != null && originLng != null) return { lat: originLat, lng: originLng };
  if (approach && boarded && originLat != null && originLng != null) return { lat: originLat, lng: originLng };
  if ((approach || !hasFinal) && destLat != null && destLng != null) return { lat: destLat, lng: destLng };
  if (originLat != null && originLng != null) return { lat: originLat, lng: originLng };
  return { lat: null, lng: null };
}

function scheduledPoint(trip) {
  const fromNotes = pickupFromNotes(trip?.notes);
  const originLat = num(trip?.origin_lat);
  const originLng = num(trip?.origin_lng);
  return {
    lat: originLat ?? fromNotes.lat,
    lng: originLng ?? fromNotes.lng,
  };
}

function queuedPoint(trip) {
  const fromNotes = pickupFromNotes(trip?.notes);
  const originLat = num(trip?.origin_lat);
  const originLng = num(trip?.origin_lng);
  const destLat = num(trip?.destination_lat);
  const destLng = num(trip?.destination_lng);
  return {
    lat: originLat ?? destLat ?? fromNotes.lat,
    lng: originLng ?? destLng ?? fromNotes.lng,
  };
}

export function saltaDayStart(now = new Date()) {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: SALTA_TZ }).format(now);
  return new Date(`${key}T00:00:00-03:00`);
}

/**
 * Misma forma que driver_demand_forecast, sin pedir que quien mira sea un chofer.
 */
export function buildOperatorDemandRows({ fleet = [], scheduled = [], queued = [] } = {}, now = new Date()) {
  const shift = saltaShift(now);
  const rows = [];

  for (const trip of fleet) {
    if (!trip?.driver_id) continue;
    const at = new Date(trip.created_at);
    if (Number.isNaN(at.getTime())) continue;
    const point = fleetPoint(trip);
    if (!isDemandCoord(point.lat, point.lng)) continue;
    const inShift = Boolean(shift) && at.getTime() >= shift.startMs;
    rows.push({
      lat: point.lat,
      lng: point.lng,
      created_at: at.toISOString(),
      kind: inShift ? 'today' : 'history',
      pickup_address: null,
      destination_address: null,
      note: null,
      trip_count: 1,
    });
  }

  const from = now.getTime() - 12 * 60 * 60 * 1000;
  const until = now.getTime() + 21 * 24 * 60 * 60 * 1000;
  for (const trip of scheduled) {
    if (!isShownScheduled(trip?.notes)) continue;
    const at = scheduledInstant(trip);
    if (!at || at.getTime() < from || at.getTime() >= until) continue;
    const point = scheduledPoint(trip);
    if (!isDemandCoord(point.lat, point.lng)) continue;
    rows.push({
      lat: point.lat,
      lng: point.lng,
      created_at: at.toISOString(),
      kind: 'scheduled',
      pickup_address: String(trip.origin_address || '').trim() || null,
      destination_address: String(trip.destination_address || '').trim() || null,
      note: String(trip.notes || '').trim() || null,
      trip_count: 1,
    });
  }

  const queueFrom = now.getTime() - 12 * 60 * 60 * 1000;
  for (const trip of queued) {
    if (trip?.scheduled_for) continue;
    if (/\[SCHEDULED_FOR\]/.test(String(trip?.notes || ''))) continue;
    const at = new Date(trip.created_at);
    if (Number.isNaN(at.getTime()) || at.getTime() < queueFrom) continue;
    const point = queuedPoint(trip);
    if (!isDemandCoord(point.lat, point.lng)) continue;
    rows.push({
      lat: point.lat,
      lng: point.lng,
      created_at: at.toISOString(),
      kind: 'queued',
      pickup_address: null,
      destination_address: null,
      note: null,
      trip_count: 1,
    });
  }

  return rows;
}
