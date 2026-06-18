import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const POLL_INTERVAL_MS = 2000;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function driversSnapshotUnchanged(prev, next) {
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (a.id !== b.id) return false;
    if (a.lat !== b.lat || a.lng !== b.lng) return false;
    if (a.isOnline !== b.isOnline) return false;
    if (a.isAvailable !== b.isAvailable) return false;
    if (a.driverNumber !== b.driverNumber) return false;
    if (a.vehicleType !== b.vehicleType) return false;
    if (a.fullName !== b.fullName) return false;
    if (a.commissionBalance !== b.commissionBalance) return false;
    if (a.commissionOverdue !== b.commissionOverdue) return false;
    if ((a.activeTrip?.id || null) !== (b.activeTrip?.id || null)) return false;
    if ((a.activeTrip?.status || null) !== (b.activeTrip?.status || null)) return false;
  }

  return true;
}

export function useDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);
  const pollRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      let response = await fetch('/api/drivers-snapshot', { cache: 'no-store' });
      let contentType = response.headers.get('content-type') || '';

      // Durante HMR, Next.js puede devolver HTML mientras compila la ruta API.
      if (!contentType.includes('application/json')) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        response = await fetch('/api/drivers-snapshot', { cache: 'no-store' });
        contentType = response.headers.get('content-type') || '';
      }

      if (!contentType.includes('application/json')) {
        return;
      }

      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        console.error('[useDrivers] fetchAll error:', payload?.error?.message || response.status);
        return;
      }

      const nextDrivers = payload?.data || [];
      setDrivers((prev) => (driversSnapshotUnchanged(prev, nextDrivers) ? prev : nextDrivers));
    } catch (err) {
      console.error('[useDrivers] fetchAll error:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    // Polling de respaldo para datos enriquecidos (viajes activos, comisiones)
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);

    // Realtime: posición GPS + disponibilidad (is_available)
    channelRef.current = supabase
      .channel('dashboard_location_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations' },
        (payload) => {
          const loc = payload.new;
          if (!loc?.driver_id) return;
          setDrivers((prev) => {
            const idx = prev.findIndex((d) => d.id === loc.driver_id);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              lat: toNumber(loc.lat, updated[idx].lat),
              lng: toNumber(loc.lng, updated[idx].lng),
              speed: toNumber(loc.speed, 0),
              heading: toNumber(loc.heading, 0),
              updatedAt: loc.updated_at,
            };
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          setDrivers((prev) => {
            const idx = prev.findIndex((d) => d.id === row.id);
            if (idx === -1) return prev;
            const updated = [...prev];
            const pendingCommission = Math.max(0, toNumber(row.pending_commission, updated[idx].pendingCommission));
            updated[idx] = {
              ...updated[idx],
              isOnline: Boolean(row.is_available),
              isAvailable: Boolean(row.is_available),
              updatedAt: row.updated_at || updated[idx].updatedAt,
              pendingCommission,
              lastCommissionPaymentAt: row.last_commission_payment_at || updated[idx].lastCommissionPaymentAt,
              commissionBalance: pendingCommission,
              commissionOverdue: pendingCommission > 0 && (
                !row.last_commission_payment_at
                || new Date(row.last_commission_payment_at) < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
              ),
            };
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchAll]);

  return { drivers, loading, refetch: fetchAll };
}
