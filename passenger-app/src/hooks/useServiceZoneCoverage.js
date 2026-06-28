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
} from '../../../shared/geo/serviceZones';

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

    const load = async () => {
      try {
        const data = await fetchActiveServiceZones();
        if (!cancelled) setZones(data);
      } catch (error) {
        console.warn('useServiceZoneCoverage:', error?.message || error);
        if (!cancelled) setZones([]);
      } finally {
        if (!cancelled) setZonesReady(true);
      }
    };

    load();

    const channel = supabase
      .channel('passenger_service_zones')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_zones' },
        () => {
          if (!cancelled) reloadZones();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
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
