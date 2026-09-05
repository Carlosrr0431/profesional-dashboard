import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS } from '../lib/promoteDueScheduledTrips';

const PENDING_STATUSES = ['queued', 'pending'];
const TRIP_SELECT =
  'id, passenger_name, passenger_phone, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, created_at, status, notes, scheduled_for';

function resolvePickupCoord(trip) {
  const lat = Number(trip?.origin_lat ?? trip?.destination_lat);
  const lng = Number(trip?.origin_lng ?? trip?.destination_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function mapPendingTrip(trip) {
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
}

/**
 * Devuelve los viajes pendientes (esperando chofer) con coordenadas de retiro.
 * Incluye programados que ya entraron a la ventana de 20 minutos.
 * Se actualiza en tiempo real vía Supabase Realtime.
 */
export function usePendingPassengers() {
  const [pendingTrips, setPendingTrips] = useState([]);
  const channelRef = useRef(null);

  const fetchPendingPassengers = useCallback(async () => {
    try {
      const dueIso = new Date(Date.now() + DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS).toISOString();
      const [pendingRes, scheduledRes] = await Promise.all([
        supabase
          .from('trips')
          .select(TRIP_SELECT)
          .in('status', PENDING_STATUSES)
          .order('created_at', { ascending: true }),
        supabase
          .from('trips')
          .select(TRIP_SELECT)
          .eq('status', 'scheduled')
          .lte('scheduled_for', dueIso),
      ]);

      if (pendingRes.error) throw pendingRes.error;

      const byId = new Map();
      for (const trip of [...(pendingRes.data || []), ...(scheduledRes.data || [])]) {
        const mapped = mapPendingTrip(trip);
        if (mapped) byId.set(mapped.id, mapped);
      }
      setPendingTrips([...byId.values()]);
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

    const tick = setInterval(fetchPendingPassengers, 15_000);

    return () => {
      clearInterval(tick);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchPendingPassengers]);

  return pendingTrips;
}
