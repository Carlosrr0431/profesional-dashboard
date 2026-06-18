import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useTripStore } from '../stores/tripStore';
import { fetchTripViaTracking } from '../services/tripService';

const DRIVER_POLL_MS = 10000;

function parseDriverPoint(source) {
  if (!source) return null;
  const lat = Number(source.lat ?? source.current_lat);
  const lng = Number(source.lng ?? source.current_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const heading = Number(source.heading);
  return {
    latitude: lat,
    longitude: lng,
    heading: Number.isFinite(heading) ? heading : undefined,
  };
}

/** Elimina canales huérfanos con el mismo topic (evita .on() tras subscribe()). */
async function removeChannelsByTopicFragment(fragment) {
  const matches = supabase
    .getChannels()
    .filter((ch) => (ch.topic || '').includes(fragment));

  await Promise.all(matches.map((ch) => supabase.removeChannel(ch)));
}

async function removeChannelSafe(channel) {
  if (!channel) return;
  await supabase.removeChannel(channel);
}

const ACTIVE_SEARCH_STATUSES = new Set(['queued', 'pending']);
const TRIP_POLL_MS = 6000;
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

export const useTripRealtime = (tripId, driverId, trackingToken) => {
  const updateActiveTrip = useTripStore((s) => s.updateActiveTrip);
  const updateDriverLocation = useTripStore((s) => s.updateDriverLocation);
  const passengerCancelledTripId = useTripStore((s) => s.passengerCancelledTripId);

  const tripChannelRef = useRef(null);
  const driverChannelRef = useRef(null);
  const pollRef = useRef(null);
  const subscribedDriverIdRef = useRef(null);
  const passengerCancelledTripIdRef = useRef(passengerCancelledTripId);
  passengerCancelledTripIdRef.current = passengerCancelledTripId;

  const updateActiveTripRef = useRef(updateActiveTrip);
  updateActiveTripRef.current = updateActiveTrip;

  const applyDriverPoint = useCallback(
    (source) => {
      const point = parseDriverPoint(source);
      if (point) updateDriverLocation(point);
    },
    [updateDriverLocation]
  );

  const fetchDriverLocation = useCallback(
    async (id) => {
      if (!id) return;

      const { data: locRows } = await supabase
        .from('driver_locations')
        .select('lat, lng, heading')
        .eq('driver_id', id)
        .order('recorded_at', { ascending: false })
        .limit(1);

      const fromLoc = parseDriverPoint(locRows?.[0]);
      if (fromLoc) {
        updateDriverLocation(fromLoc);
        return;
      }

      const { data: driverRow } = await supabase
        .from('drivers')
        .select('current_lat, current_lng')
        .eq('id', id)
        .maybeSingle();

      applyDriverPoint(driverRow);
    },
    [applyDriverPoint, updateDriverLocation]
  );

  const teardownDriverChannel = useCallback(async () => {
    const channel = driverChannelRef.current;
    driverChannelRef.current = null;
    subscribedDriverIdRef.current = null;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (channel) {
      await removeChannelSafe(channel);
    }
  }, []);

  const setupDriverChannel = useCallback(
    async (id) => {
      if (!id) return;
      if (subscribedDriverIdRef.current === id && driverChannelRef.current) return;

      await teardownDriverChannel();
      await removeChannelsByTopicFragment(`passenger_driver_${id}`);
      subscribedDriverIdRef.current = id;

      fetchDriverLocation(id);

      const channel = supabase.channel(`passenger_driver_${id}`);
      channel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'drivers',
            filter: `id=eq.${id}`,
          },
          (payload) => {
            applyDriverPoint(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'driver_locations',
            filter: `driver_id=eq.${id}`,
          },
          (payload) => {
            applyDriverPoint(payload.new);
          }
        )
        .subscribe();

      driverChannelRef.current = channel;

      pollRef.current = setInterval(() => {
        fetchDriverLocation(id);
      }, DRIVER_POLL_MS);
    },
    [applyDriverPoint, fetchDriverLocation, teardownDriverChannel]
  );

  const setupDriverChannelRef = useRef(setupDriverChannel);
  setupDriverChannelRef.current = setupDriverChannel;

  // Ubicación del conductor
  useEffect(() => {
    if (!driverId) {
      teardownDriverChannel();
      return undefined;
    }

    setupDriverChannel(driverId).catch(console.warn);

    return () => {
      teardownDriverChannel().catch(console.warn);
    };
  }, [driverId, setupDriverChannel, teardownDriverChannel]);

  // Estado del viaje — solo re-suscribe si cambia tripId
  useEffect(() => {
    if (!tripId) return undefined;

    let cancelled = false;

    const subscribeTrip = async () => {
      const topicFragment = `passenger_trip_${tripId}`;

      await removeChannelsByTopicFragment(topicFragment);

      if (cancelled) return;

      const channel = supabase.channel(topicFragment);
      channel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'trips',
            filter: `id=eq.${tripId}`,
          },
          (payload) => {
            const trip = payload.new;
            if (!trip) return;

            if (
              passengerCancelledTripIdRef.current
              && passengerCancelledTripIdRef.current === trip.id
              && ACTIVE_SEARCH_STATUSES.has(String(trip.status || '').toLowerCase())
            ) {
              return;
            }

            updateActiveTripRef.current(trip);

            if (trip.driver_id) {
              setupDriverChannelRef.current(trip.driver_id).catch(console.warn);
            }
          }
        )
        .subscribe();

      if (cancelled) {
        await removeChannelSafe(channel);
        return;
      }

      tripChannelRef.current = channel;
    };

    subscribeTrip().catch(console.warn);

    return () => {
      cancelled = true;
      const channel = tripChannelRef.current;
      tripChannelRef.current = null;
      if (channel) {
        removeChannelSafe(channel).catch(console.warn);
      }
      removeChannelsByTopicFragment(`passenger_trip_${tripId}`).catch(console.warn);
    };
  }, [tripId]);

  // Polling de respaldo: Realtime a veces no entrega el UPDATE (p. ej. emulador).
  useEffect(() => {
    if (!tripId) return undefined;

    let cancelled = false;

    const pullTrip = async () => {
      const key = trackingToken || tripId;
      const trip = await fetchTripViaTracking(key);
      if (cancelled || !trip) return;

      if (
        passengerCancelledTripIdRef.current
        && passengerCancelledTripIdRef.current === trip.id
        && ACTIVE_SEARCH_STATUSES.has(String(trip.status || '').toLowerCase())
      ) {
        return;
      }

      updateActiveTripRef.current(trip);

      if (trip.driver_id) {
        setupDriverChannelRef.current(trip.driver_id).catch(console.warn);
      }
    };

    pullTrip().catch(console.warn);
    const intervalId = setInterval(() => {
      const status = useTripStore.getState().activeTrip?.status;
      if (TERMINAL_STATUSES.has(status)) return;
      pullTrip().catch(console.warn);
    }, TRIP_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [tripId, trackingToken]);
};
