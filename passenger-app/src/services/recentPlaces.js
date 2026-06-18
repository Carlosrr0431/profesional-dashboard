import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveTripFinalDestCoords } from '../../../shared/trip-contract';
import { normalizePassengerPhone } from '../utils/phone';

export { normalizePassengerPhone };

const LEGACY_KEY = '@passenger_recent_places';
const STORAGE_PREFIX = '@passenger_frequent_places_v2';
const MAX_PLACES = 15;
const MAX_PROCESSED_TRIP_IDS = 120;

function getStorageKey(passengerPhone) {
  const phone = normalizePassengerPhone(passengerPhone);
  if (!phone) return null;
  return `${STORAGE_PREFIX}_${phone}`;
}

export const buildPlaceKey = (place) => {
  if (place?.placeId) return `pid:${place.placeId}`;
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `geo:${lat.toFixed(5)},${lng.toFixed(5)}`;
  }
  const addr = String(place?.address || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `addr:${addr}`;
};

const normalizePlaceEntry = (place, overrides = {}) => ({
  address: String(place.address || '').trim(),
  lat: Number.isFinite(Number(place.lat)) ? Number(place.lat) : null,
  lng: Number.isFinite(Number(place.lng)) ? Number(place.lng) : null,
  placeId: place.placeId ?? null,
  title:
    place.title ||
    String(place.address || '').split(',')[0]?.trim() ||
    String(place.address || ''),
  visitCount: Math.max(0, Number(overrides.visitCount ?? place.visitCount ?? 0)),
  lastUsedAt: Number(overrides.lastUsedAt ?? place.lastUsedAt ?? Date.now()),
  source: overrides.source ?? place.source ?? 'manual',
});

export const sortFrequentPlaces = (places) =>
  [...places].sort((a, b) => {
    const countDiff = (b.visitCount || 0) - (a.visitCount || 0);
    if (countDiff !== 0) return countDiff;
    return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
  });

const emptyStore = () => ({ places: [], processedTripIds: [] });

async function readStore(passengerPhone) {
  const key = getStorageKey(passengerPhone);
  if (!key) return emptyStore();

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      const migrated = await migrateLegacyStore(passengerPhone);
      if (migrated) return migrated;
      return emptyStore();
    }

    const parsed = JSON.parse(raw);
    return {
      places: Array.isArray(parsed.places) ? parsed.places : [],
      processedTripIds: Array.isArray(parsed.processedTripIds)
        ? parsed.processedTripIds
        : [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(passengerPhone, store) {
  const key = getStorageKey(passengerPhone);
  if (!key) return;
  const next = {
    places: sortFrequentPlaces(store.places).slice(0, MAX_PLACES),
    processedTripIds: store.processedTripIds.slice(-MAX_PROCESSED_TRIP_IDS),
  };
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

async function migrateLegacyStore(passengerPhone) {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const store = {
      places: parsed.map((place) =>
        normalizePlaceEntry(place, { visitCount: 0, source: 'legacy' })
      ),
      processedTripIds: [],
    };
    await writeStore(passengerPhone, store);
    await AsyncStorage.removeItem(LEGACY_KEY);
    return store;
  } catch {
    return null;
  }
}

function upsertPlace(store, place, { increment = 0, source = 'manual' } = {}) {
  if (!place?.address) return store;
  const entry = normalizePlaceEntry(place, {
    visitCount: increment,
    lastUsedAt: Date.now(),
    source,
  });
  const key = buildPlaceKey(entry);
  const existing = store.places.find((p) => buildPlaceKey(p) === key);

  if (existing) {
    store.places = store.places.map((p) =>
      buildPlaceKey(p) === key
        ? normalizePlaceEntry(
            { ...existing, ...entry },
            {
              visitCount: (existing.visitCount || 0) + increment,
              lastUsedAt: Date.now(),
              source,
            }
          )
        : p
    );
  } else {
    store.places = [entry, ...store.places];
  }

  store.places = sortFrequentPlaces(store.places).slice(0, MAX_PLACES);
  return store;
}

export function extractDestinationFromTrip(trip) {
  if (!trip || trip.status !== 'completed') return null;
  const dest = resolveTripFinalDestCoords(trip);
  if (!dest?.address) return null;
  const lat = Number(dest.lat);
  const lng = Number(dest.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    address: dest.address,
    lat,
    lng,
    placeId: null,
    lastUsedAt: trip.completed_at
      ? new Date(trip.completed_at).getTime()
      : trip.created_at
        ? new Date(trip.created_at).getTime()
        : Date.now(),
  };
}

function getTripLastUsedAt(trip) {
  if (trip.completed_at) return new Date(trip.completed_at).getTime();
  if (trip.created_at) return new Date(trip.created_at).getTime();
  return Date.now();
}

/**
 * Recalcula visitCount solo desde viajes completados (fuente de verdad).
 * Las selecciones manuales solo actualizan lastUsedAt y mantienen el lugar en la lista.
 */
function syncPlacesWithTripHistory(store, trips = []) {
  const byKey = new Map();
  const processed = new Set();

  for (const place of store.places) {
    const key = buildPlaceKey(place);
    byKey.set(key, normalizePlaceEntry(place, { visitCount: 0 }));
  }

  for (const trip of trips) {
    if (!trip?.id) continue;
    processed.add(trip.id);
    if (trip.status === 'cancelled') continue;

    const destination = extractDestinationFromTrip(trip);
    if (!destination) continue;

    const key = buildPlaceKey(destination);
    const lastUsed = getTripLastUsedAt(trip);
    const prev = byKey.get(key);

    byKey.set(
      key,
      normalizePlaceEntry(
        { ...(prev || {}), ...destination, placeId: prev?.placeId ?? null },
        {
          visitCount: (prev?.visitCount || 0) + 1,
          lastUsedAt: Math.max(prev?.lastUsedAt || 0, lastUsed),
          source: 'trip_history',
        }
      )
    );
  }

  return {
    places: sortFrequentPlaces([...byKey.values()]).slice(0, MAX_PLACES),
    processedTripIds: [...processed],
  };
}

export const getRecentPlaces = async (passengerPhone) => {
  const store = await readStore(passengerPhone);
  return sortFrequentPlaces(store.places);
};

/** Registra selección manual: no suma viajes, solo actualiza recencia. */
export const addRecentPlace = async (passengerPhone, place) => {
  if (!place?.address || !normalizePassengerPhone(passengerPhone)) return [];
  try {
    const store = await readStore(passengerPhone);
    const next = upsertPlace(store, place, { increment: 0, source: 'manual' });
    await writeStore(passengerPhone, next);
    return sortFrequentPlaces(next.places);
  } catch {
    return [];
  }
};

export const recordTripDestination = async (passengerPhone, trip) => {
  if (!trip?.id || !normalizePassengerPhone(passengerPhone)) return [];
  try {
    const store = await readStore(passengerPhone);
    if (store.processedTripIds.includes(trip.id)) {
      return sortFrequentPlaces(store.places);
    }

    const destination = extractDestinationFromTrip(trip);
    if (!destination) {
      const nextIds = [...store.processedTripIds, trip.id];
      await writeStore(passengerPhone, { ...store, processedTripIds: nextIds });
      return sortFrequentPlaces(store.places);
    }

    const next = upsertPlace(store, destination, {
      increment: 1,
      source: 'trip_completed',
    });
    next.processedTripIds = [...next.processedTripIds, trip.id];
    await writeStore(passengerPhone, next);
    return sortFrequentPlaces(next.places);
  } catch {
    return [];
  }
};

/**
 * Carga destinos frecuentes del pasajero y sincroniza viajes completados del servidor.
 */
export const loadFrequentPlaces = async (passengerPhone, fetchTripHistory) => {
  if (!normalizePassengerPhone(passengerPhone)) return [];

  try {
    let store = await readStore(passengerPhone);

    if (typeof fetchTripHistory === 'function') {
      const trips = await fetchTripHistory(passengerPhone);
      store = syncPlacesWithTripHistory(store, trips);
      await writeStore(passengerPhone, store);
    }

    return sortFrequentPlaces(store.places);
  } catch {
    return [];
  }
};
