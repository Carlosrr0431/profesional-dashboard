import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveDriverIsOnline } from '../lib/driverPresence';
import { applyDriverLocationRealtime, nextGpsFromDriverRow } from '../lib/driverMapGps';
import {
  applyTripRealtimeToDrivers,
  mergeDriversSnapshotWithTripRealtime,
} from '../lib/tripRealtime';
import {
  resolveCommissionOverdue,
  isDriverDispatchBlocked,
  normalizeBillingMode,
} from '../lib/driverBilling';

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
    if (a.speed !== b.speed || a.heading !== b.heading) return false;
    if (a.isOnline !== b.isOnline) return false;
    if (a.isAvailable !== b.isAvailable) return false;
    if (a.driverNumber !== b.driverNumber) return false;
    if (a.vehicleType !== b.vehicleType) return false;
    if (a.fullName !== b.fullName) return false;
    if (a.commissionBalance !== b.commissionBalance) return false;
    if (a.commissionOverdue !== b.commissionOverdue) return false;
    if (a.dispatchBlocked !== b.dispatchBlocked) return false;
    if (a.billingMode !== b.billingMode) return false;
    if (Boolean(a.commissionBlocked) !== Boolean(b.commissionBlocked)) return false;
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
      setDrivers((prev) => {
        const merged = mergeDriversSnapshotWithTripRealtime(prev, nextDrivers);
        return driversSnapshotUnchanged(prev, merged) ? prev : merged;
      });
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

    // GPS y flota: solo Realtime. El snapshot inicial no se vuelve a pedir en loop.
    channelRef.current = supabase
      .channel('dashboard_location_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations' },
        (payload) => {
          const loc = payload.new;
          if (!loc?.driver_id) return;
          setDrivers((prev) => {
            const next = applyDriverLocationRealtime(prev, loc);
            if (next === prev && !prev.some((d) => d.id === loc.driver_id)) {
              scheduleFetchAll();
            }
            return next;
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
            const billingPatch = {
              pending_commission: pendingCommission,
              commission_debt_since_at: row.commission_debt_since_at ?? null,
              billing_mode: row.billing_mode ?? prevDriver.billingMode,
              commission_blocked: row.commission_blocked ?? prevDriver.commissionBlocked,
            };
            const gps = nextGpsFromDriverRow(prevDriver, row);
            const nextLat = gps.lat;
            const nextLng = gps.lng;
            const nextUpdatedAt = gps.updatedAt;
            const flaggedAvailable = Boolean(row.is_available);
            const gpsSimulationActive = row.gps_simulation_active != null
              ? Boolean(row.gps_simulation_active)
              : prevDriver.gpsSimulationActive;
            const isOnline = resolveDriverIsOnline({
              isAvailable: flaggedAvailable,
              lat: nextLat,
              lng: nextLng,
              updatedAt: nextUpdatedAt,
              gpsSimulationActive,
            });
            updated[idx] = {
              ...prevDriver,
              lat: nextLat,
              lng: nextLng,
              isOnline,
              isAvailable: flaggedAvailable,
              gpsSimulationActive,
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
              billingMode: normalizeBillingMode(billingPatch.billing_mode),
              commissionBlocked: Boolean(billingPatch.commission_blocked),
              commissionOverdue: resolveCommissionOverdue(billingPatch),
              dispatchBlocked: isDriverDispatchBlocked(billingPatch),
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
        (payload) => {
          setDrivers((prev) => applyTripRealtimeToDrivers(prev, payload));
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
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          scheduleFetchAll();
        }
      });

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchAll, scheduleFetchAll]);

  return { drivers, loading, refetch: fetchAll };
}
