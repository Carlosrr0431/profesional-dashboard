import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const PENDING_STATUSES = ['pending'];

/**
 * Devuelve los viajes pendientes (esperando chofer) con coordenadas de retiro.
 * Se actualiza en tiempo real vía Supabase Realtime.
 */
export function usePendingPassengers() {
  const [pendingTrips, setPendingTrips] = useState([]);
  const channelRef = useRef(null);

  const fetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('trips')
      .select('id, passenger_name, passenger_phone, destination_address, destination_lat, destination_lng, created_at, status, notes')
      .in('status', PENDING_STATUSES)
      .not('destination_lat', 'is', null)
      .not('destination_lng', 'is', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[usePendingPassengers] fetch error:', error);
      return;
    }

    setPendingTrips(
      (data || [])
        .filter((t) => Number.isFinite(Number(t.destination_lat)) && Number.isFinite(Number(t.destination_lng)))
        .map((t) => ({
          id: t.id,
          passengerName: t.passenger_name || 'Pasajero',
          passengerPhone: t.passenger_phone || '',
          address: t.destination_address || 'Sin dirección',
          lat: Number(t.destination_lat),
          lng: Number(t.destination_lng),
          createdAt: t.created_at,
          status: t.status,
          notes: t.notes || '',
        }))
    );
  }, []);

  useEffect(() => {
    fetch();

    channelRef.current = supabase
      .channel('pending_passengers_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetch)
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetch]);

  return pendingTrips;
}
