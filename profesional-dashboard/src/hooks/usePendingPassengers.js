import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const PENDING_STATUSES = ['queued', 'pending'];

function resolvePickupCoord(trip) {
  const lat = Number(trip?.origin_lat ?? trip?.destination_lat);
  const lng = Number(trip?.origin_lng ?? trip?.destination_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Devuelve los viajes pendientes (esperando chofer) con coordenadas de retiro.
 * Se actualiza en tiempo real vía Supabase Realtime.
 */
export function usePendingPassengers() {
  const [pendingTrips, setPendingTrips] = useState([]);
  const channelRef = useRef(null);

  const fetchPendingPassengers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select(
          'id, passenger_name, passenger_phone, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, created_at, status, notes',
        )
        .in('status', PENDING_STATUSES)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setPendingTrips(
        (data || [])
          .map((trip) => {
            const coord = resolvePickupCoord(trip);
            if (!coord) return null;
            return {
              id: trip.id,
              passengerName: trip.passenger_name || 'Pasajero',
              passengerPhone: trip.passenger_phone || '',
              address: trip.origin_address || trip.destination_address || 'Sin dirección',
              lat: coord.lat,
              lng: coord.lng,
              createdAt: trip.created_at,
              status: trip.status,
              notes: trip.notes || '',
            };
          })
          .filter(Boolean),
      );
    } catch (err) {
      console.error('[usePendingPassengers] fetch error:', err?.message || String(err));
    }
  }, []);

  useEffect(() => {
    fetchPendingPassengers();

    channelRef.current = supabase
      .channel('pending_passengers_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchPendingPassengers)
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchPendingPassengers]);

  return pendingTrips;
}
