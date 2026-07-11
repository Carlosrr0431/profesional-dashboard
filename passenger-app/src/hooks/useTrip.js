import { useCallback } from 'react';
import { supabase } from '../services/supabase';
import { createTripViaApi, cancelTripViaApi, fetchTripViaTracking } from '../services/tripService';
import { isPickupCoveredByServiceZones } from '../services/serviceZones';
import { PICKUP_OUTSIDE_COVERAGE_MESSAGE } from '../../shared/geo/serviceZones';
import { useTripStore } from '../stores/tripStore';
import { getPassengerPhoneVariants } from '../utils/phone';

const HISTORY_PAGE_SIZE = 40;

const TRIP_HISTORY_FIELDS =
  'id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, notes, status, created_at, completed_at, price, distance_km, duration_minutes, driver_id, passenger_name';

export const useTrip = () => {
  const {
    setActiveTrip,
    clearActiveTrip,
    setCreating,
    updateActiveTrip,
    markPassengerCancelled,
  } = useTripStore();

  const requestTrip = useCallback(async ({
    pickupAddress,
    pickupLat,
    pickupLng,
    pickupPlaceId,
    destinationAddress,
    destinationLat,
    destinationLng,
    destinationPlaceId,
    destinationHint,
    waypoints,
    estimatedPrice,
    distanceKm,
    durationMinutes,
    passengerName,
    passengerPhone,
    notes,
  }) => {
    setCreating(true);
    try {
      if (Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
        const covered = await isPickupCoveredByServiceZones(pickupLat, pickupLng);
        if (!covered) {
          return { ok: false, error: PICKUP_OUTSIDE_COVERAGE_MESSAGE };
        }
      }

      const trip = await createTripViaApi({
        pickupAddress,
        pickupLat,
        pickupLng,
        pickupPlaceId,
        destinationAddress,
        destinationLat,
        destinationLng,
        destinationPlaceId,
        destinationHint,
        waypoints,
        estimatedPrice,
        distanceKm,
        durationMinutes,
        passengerName,
        passengerPhone,
        notes,
      });
      await setActiveTrip(trip);
      return { ok: true, trip };
    } catch (error) {
      console.error('Error solicitando viaje:', error);
      return { ok: false, error: error.message || 'No se pudo solicitar el viaje.' };
    } finally {
      setCreating(false);
    }
  }, [setActiveTrip, setCreating]);

  const cancelTrip = useCallback(async (tripId) => {
    try {
      markPassengerCancelled(tripId);
      const trip = await cancelTripViaApi(tripId);
      await setActiveTrip(trip);
      return { ok: true, trip };
    } catch (error) {
      markPassengerCancelled(null);
      console.error('Error cancelando viaje:', error);
      return { ok: false, error: error.message || 'No se pudo cancelar el viaje.' };
    }
  }, [markPassengerCancelled, setActiveTrip]);

  const fetchTrip = useCallback(async (tripId, trackingToken) => {
    let fromDb = null;
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single();

      if (!error && data) fromDb = data;
    } catch (error) {
      console.warn('fetchTrip supabase:', error?.message || error);
    }

    const trackingKey = trackingToken || tripId;
    const fromApi = await fetchTripViaTracking(trackingKey);

    if (fromApi && fromDb) {
      const apiStatus = String(fromApi.status || '');
      const dbStatus = String(fromDb.status || '');
      const statusRank = (s) => {
        const order = ['queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress', 'completed', 'cancelled'];
        return order.indexOf(s);
      };
      if (statusRank(apiStatus) > statusRank(dbStatus)) return fromApi;
      if (fromApi.driver_id && !fromDb.driver_id) return { ...fromDb, ...fromApi };
      return fromDb;
    }

    return fromApi || fromDb;
  }, []);

  const fetchTripHistory = useCallback(async (phone, offset = 0, limit = HISTORY_PAGE_SIZE) => {
    const phoneVariants = getPassengerPhoneVariants(phone);
    if (!phoneVariants.length) return [];

    try {
      const { data, error } = await supabase
        .from('trips')
        .select(TRIP_HISTORY_FIELDS)
        .in('passenger_phone', phoneVariants)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo historial:', error);
      return [];
    }
  }, []);

  const fetchDriver = useCallback(async (driverId) => {
    if (!driverId) return null;
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, full_name, phone, vehicle_plate, vehicle_model, current_lat, current_lng, photo_url')
        .eq('id', driverId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo conductor:', error);
      return null;
    }
  }, []);

  return {
    requestTrip,
    cancelTrip,
    fetchTrip,
    fetchTripHistory,
    fetchDriver,
  };
};
