import { detectTripSource } from './detectTripSource';

const KNOWN_SOURCES = new Set(['dashboard', 'passenger_app', 'passenger_web', 'whatsapp']);

const SOURCE_LABELS = {
  dashboard: 'Panel',
  passenger_app: 'App pasajeros',
  passenger_web: 'Web pasajeros',
  whatsapp: 'WhatsApp',
};

const SOURCE_BADGE_CLASS = {
  dashboard: 'bg-slate-100 text-slate-700 border-slate-300',
  passenger_app: 'bg-sky-50 text-sky-700 border-sky-200',
  passenger_web: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  whatsapp: 'bg-violet-50 text-violet-700 border-violet-200',
};

export function parseScheduledSource(trip) {
  const notes = String(trip?.notes || '');
  const tagged = notes.match(/\[SCHEDULED_SOURCE\]\s*([a-z_]+)/i);
  if (tagged?.[1]) {
    const raw = tagged[1].toLowerCase();
    if (KNOWN_SOURCES.has(raw)) return raw;
  }

  const detected = detectTripSource(notes);
  if (detected === 'otro') return 'whatsapp';
  return detected;
}

export function scheduledSourceLabel(source) {
  return SOURCE_LABELS[source] || SOURCE_LABELS.whatsapp;
}

export function scheduledSourceBadgeClass(source) {
  return SOURCE_BADGE_CLASS[source] || SOURCE_BADGE_CLASS.whatsapp;
}

export function isScheduledDispatchingStatus(status) {
  const value = String(status || '').toLowerCase();
  return value === 'queued' || value === 'pending';
}

export function scheduledPickupAddress(trip) {
  const origin = String(trip?.origin_address || '').trim();
  if (origin) return origin;
  const dest = String(trip?.destination_address || '').trim();
  return dest || '—';
}

export function scheduledDestinationAddress(trip) {
  const origin = String(trip?.origin_address || '').trim();
  const dest = String(trip?.destination_address || '').trim();
  if (origin && dest && dest !== origin) return dest;
  return null;
}
