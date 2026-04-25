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

  const fetchPendingPassengers = useCallback(async () => {
    let payload;
    try {
      const response = await fetch(`/api/pending-passengers?statuses=${encodeURIComponent(PENDING_STATUSES.join(','))}`);
      payload = await response.json();
      if (!response.ok) {
        console.error('[usePendingPassengers] fetch error:', {
          status: response.status,
          code: payload?.error?.code || null,
          message: payload?.error?.message || 'Request failed',
          details: payload?.error?.details || null,
        });
        return;
      }
    } catch (err) {
      console.error('[usePendingPassengers] network error:', {
        message: err?.message || String(err),
      });
      return;
    }

    const data = payload?.data || [];

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
