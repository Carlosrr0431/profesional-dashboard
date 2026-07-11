import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
import { supabase } from '../services/supabase';
import {
  fetchActiveServiceZones,
  invalidateServiceZonesCache,
} from '../services/serviceZones';
import {
  isPickupInActiveZones,
  PICKUP_OUTSIDE_COVERAGE_MESSAGE,
  PICKUP_OUTSIDE_COVERAGE_TITLE,
} from '../../shared/geo/serviceZones';

export function notifyPickupOutsideCoverage() {
  Toast.show({
    type: 'error',
    text1: PICKUP_OUTSIDE_COVERAGE_TITLE,
    text2: PICKUP_OUTSIDE_COVERAGE_MESSAGE,
    visibilityTime: 5000,
  });
}

/**
 * Carga zonas activas y determina si la recogida actual queda fuera de cobertura.
 * @param {{ lat?: number, lng?: number } | null} pickup
 */
export function useServiceZoneCoverage(pickup) {
  const [zones, setZones] = useState([]);
  const [zonesReady, setZonesReady] = useState(false);
  const prevOutsideRef = useRef(false);

  const reloadZones = useCallback(async () => {
    try {
      invalidateServiceZonesCache();
      const data = await fetchActiveServiceZones({ force: true });
      setZones(data);
    } catch (error) {
      console.warn('useServiceZoneCoverage:', error?.message || error);
      setZones([]);
    } finally {
      setZonesReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel = null;

    const setup = async () => {
      // Elimina canales huérfanos con el mismo topic antes de suscribir.
      // Necesario en React StrictMode (double-invoke) para evitar el error
      // "cannot add postgres_changes callbacks after subscribe()".
      const orphans = supabase
        .getChannels()
        .filter((ch) => String(ch.topic || '').includes('passenger_service_zones'));
      if (orphans.length) {
        await Promise.all(orphans.map((ch) => supabase.removeChannel(ch)));
      }

      if (cancelled) return;

      try {
        const data = await fetchActiveServiceZones();
        if (!cancelled) setZones(data);
      } catch (error) {
        console.warn('useServiceZoneCoverage:', error?.message || error);
        if (!cancelled) setZones([]);
      } finally {
        if (!cancelled) setZonesReady(true);
      }

      if (cancelled) return;

      channel = supabase
        .channel('passenger_service_zones')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'service_zones' },
          () => {
            if (!cancelled) reloadZones();
          }
        )
        .subscribe();
    };

    setup().catch((err) =>
      console.warn('useServiceZoneCoverage setup:', err?.message || err)
    );

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel).catch(() => {});
        channel = null;
      }
    };
  }, [reloadZones]);

  const pickupOutsideCoverage = useMemo(() => {
    if (!zonesReady) return false;
    if (!Number.isFinite(pickup?.lat) || !Number.isFinite(pickup?.lng)) return false;
    return !isPickupInActiveZones(zones, pickup.lat, pickup.lng);
  }, [zonesReady, zones, pickup?.lat, pickup?.lng]);

  useEffect(() => {
    if (pickupOutsideCoverage && !prevOutsideRef.current) {
      notifyPickupOutsideCoverage();
    }
    prevOutsideRef.current = pickupOutsideCoverage;
  }, [pickupOutsideCoverage]);

  const validatePickupForTrip = useCallback(
    (lat, lng) => {
      if (!zonesReady) return { allowed: true };
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { allowed: true };
      if (isPickupInActiveZones(zones, lat, lng)) return { allowed: true };
      return {
        allowed: false,
        title: PICKUP_OUTSIDE_COVERAGE_TITLE,
        message: PICKUP_OUTSIDE_COVERAGE_MESSAGE,
      };
    },
    [zones, zonesReady]
  );

  return {
    zonesReady,
    pickupOutsideCoverage,
    validatePickupForTrip,
    notifyPickupOutsideCoverage,
  };
}
