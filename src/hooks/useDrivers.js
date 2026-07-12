import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveDriverIsOnline } from '../lib/driverPresence';

const POLL_INTERVAL_MS = 2000;
const REALTIME_REFETCH_DEBOUNCE_MS = 300;

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
    if (Boolean(a.isAssignedDriver) !== Boolean(b.isAssignedDriver)) return false;
    if ((a.ownerId || null) !== (b.ownerId || null)) return false;
    if ((a.photoUrl || '') !== (b.photoUrl || '')) return false;
  }

  return true;
}

export function useDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);
  const pollRef = useRef(null);
  const refetchTimerRef = useRef(null);

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

  const scheduleFetchAll = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      fetchAll();
    }, REALTIME_REFETCH_DEBOUNCE_MS);
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();

    // Polling de respaldo para datos enriquecidos (viajes activos, comisiones)
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);

    // Realtime: GPS, alta/baja de choferes, disponibilidad y viajes activos
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
            if (idx === -1) {
              scheduleFetchAll();
              return prev;
            }
            const prevDriver = prev[idx];
            const nextLat = toNumber(loc.lat, prevDriver.lat);
            const nextLng = toNumber(loc.lng, prevDriver.lng);
            const nextUpdatedAt = loc.updated_at || loc.recorded_at || prevDriver.updatedAt;
            // Evitar pisar una posición más fresca con un evento atrasado.
            if (
              nextUpdatedAt
              && prevDriver.updatedAt
              && new Date(nextUpdatedAt).getTime() < new Date(prevDriver.updatedAt).getTime()
            ) {
              return prev;
            }
            if (nextLat === prevDriver.lat && nextLng === prevDriver.lng
              && nextUpdatedAt === prevDriver.updatedAt) {
              return prev;
            }
            const updated = [...prev];
            updated[idx] = {
              ...prevDriver,
              lat: nextLat,
              lng: nextLng,
              speed: toNumber(loc.speed ?? loc.speed_kmh, prevDriver.speed || 0),
              heading: toNumber(loc.heading, prevDriver.heading || 0),
              updatedAt: nextUpdatedAt,
              isOnline: resolveDriverIsOnline({
                isAvailable: prevDriver.isOnline || prevDriver.isAvailable,
                lat: nextLat,
                lng: nextLng,
                updatedAt: nextUpdatedAt,
              }),
            };
            updated[idx].isAvailable = updated[idx].isOnline;
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        (payload) => {
          const eventType = payload.eventType;
          if (eventType === 'INSERT' || eventType === 'DELETE') {
            scheduleFetchAll();
            return;
          }

          const row = payload.new;
          if (!row?.id) {
            scheduleFetchAll();
            return;
          }

          setDrivers((prev) => {
            const idx = prev.findIndex((d) => d.id === row.id);
            if (idx === -1) {
              scheduleFetchAll();
              return prev;
            }
            const prevDriver = prev[idx];
            const updated = [...prev];
            const pendingCommission = Math.max(0, toNumber(row.pending_commission, prevDriver.pendingCommission));
            const hasCoords = row.current_lat != null && row.current_lng != null;
            const nextLat = hasCoords ? toNumber(row.current_lat, prevDriver.lat) : prevDriver.lat;
            const nextLng = hasCoords ? toNumber(row.current_lng, prevDriver.lng) : prevDriver.lng;
            const nextUpdatedAt = prevDriver.updatedAt || row.updated_at;
            const flaggedAvailable = Boolean(row.is_available);
            const isOnline = resolveDriverIsOnline({
              isAvailable: flaggedAvailable,
              lat: nextLat,
              lng: nextLng,
              updatedAt: nextUpdatedAt,
            });
            updated[idx] = {
              ...prevDriver,
              ...(hasCoords ? { lat: nextLat, lng: nextLng } : null),
              isOnline,
              isAvailable: isOnline,
              fullName: row.full_name || prevDriver.fullName,
              driverNumber: row.driver_number ?? prevDriver.driverNumber,
              phone: row.phone || prevDriver.phone,
              photoUrl: row.photo_url || prevDriver.photoUrl || '',
              vehicleBrand: row.vehicle_brand || prevDriver.vehicleBrand,
              vehicleModel: row.vehicle_model || prevDriver.vehicleModel,
              vehiclePlate: row.vehicle_plate || prevDriver.vehiclePlate,
              vehicleColor: row.vehicle_color || prevDriver.vehicleColor,
              vehicleType: row.vehicle_type || prevDriver.vehicleType,
              // No pisar el timestamp de GPS con updated_at genérico del chofer.
              updatedAt: nextUpdatedAt,
              pendingCommission,
              lastCommissionPaymentAt: row.last_commission_payment_at || prevDriver.lastCommissionPaymentAt,
              commissionBalance: pendingCommission,
              commissionOverdue: pendingCommission > 0 && (
                row.commission_debt_since_at
                  ? new Date(row.commission_debt_since_at) < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
                  : false
              ),
              isAssignedDriver: Boolean(row.is_assigned_driver && row.owner_id),
              ownerId: row.owner_id || null,
            };
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        () => {
          scheduleFetchAll();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commission_payments' },
        () => {
          scheduleFetchAll();
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollRef.current);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchAll, scheduleFetchAll]);

  return { drivers, loading, refetch: fetchAll };
}
