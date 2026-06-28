import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { useTripStore } from '../stores/tripStore';
import { useAuthStore } from '../stores/authStore';
import { useTrip } from './useTrip';
import { recordTripDestination } from '../services/recentPlaces';
import { getDirections } from '../services/googleMaps';
import { resolveTripPickupCoords, resolveTripFinalDestCoords } from '../../../shared/trip-contract';
import {
  getTripPickupDisplayAddress,
  getTripDestinationDisplayAddress,
} from '../utils/tripDisplayAddresses';
import {
  haversineMeters,
  snapToRoute,
  getBearing,
  getPointAheadOnRoute,
  smoothAngle,
  buildPassengerRemainingPath,
} from '../utils/routeMapUtils';
import { useSmoothMapPosition } from './useSmoothMapPosition';

const ROUTE_REFRESH_MS = 45000;
const ROUTE_MOVE_THRESHOLD_M = 120;

export const TRIP_STATUS_CONFIG = {
  queued: {
    label: 'Buscando conductor',
    desc: 'Asignando el chofer más cercano',
    showDriver: false,
    canCancel: true,
    pulse: true,
    progress: 0.12,
  },
  pending: {
    label: 'Confirmando viaje',
    desc: 'Un conductor está revisando tu solicitud',
    showDriver: false,
    canCancel: true,
    pulse: true,
    progress: 0.28,
  },
  accepted: {
    label: 'Conductor asignado',
    desc: 'En breve sale hacia tu ubicación',
    showDriver: true,
    canCancel: false,
    pulse: false,
    progress: 0.5,
  },
  going_to_pickup: {
    label: 'Conductor en camino',
    desc: 'Se dirige al punto de recogida',
    showDriver: true,
    canCancel: false,
    pulse: false,
    progress: 0.72,
  },
  in_progress: {
    label: 'Viaje en curso',
    desc: 'Disfrutá el trayecto',
    showDriver: true,
    canCancel: false,
    pulse: false,
    progress: 1,
  },
  completed: {
    label: 'Viaje completado',
    desc: 'Gracias por viajar con nosotros',
    showDriver: false,
    canCancel: false,
    pulse: false,
    progress: 1,
  },
  cancelled: {
    label: 'Viaje cancelado',
    desc: 'La solicitud fue cancelada',
    showDriver: false,
    canCancel: false,
    pulse: false,
    progress: 0,
  },
};

export function usePassengerActiveTrip({
  mapRef,
  topInset = 0,
  sheetBottom = 120,
  screenHeight = 800,
  enabled = true,
}) {
  const { activeTrip, driverLocation, clearActiveTrip, updateDriverLocation, setActiveTrip } = useTripStore();
  const { profile } = useAuthStore();
  const { cancelTrip, fetchDriver, fetchTrip } = useTrip();

  const [driver, setDriver] = useState(null);
  const [tripRouteCoords, setTripRouteCoords] = useState([]);
  const [driverRouteCoords, setDriverRouteCoords] = useState([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);
  const recordedDestinationTripRef = useRef(null);
  const tripMapFittedRef = useRef(false);
  const lastRouteOriginRef = useRef(null);
  const lastRouteFetchAtRef = useRef(0);
  const routeFetchInFlightRef = useRef(false);
  const headingRef = useRef(0);
  const [markerHeading, setMarkerHeading] = useState(0);

  const status = enabled ? (activeTrip?.status ?? null) : null;
  const baseCfg = status ? (TRIP_STATUS_CONFIG[status] || TRIP_STATUS_CONFIG.queued) : null;
  const isSearching = status === 'queued' || status === 'pending';
  const isFinished = status === 'completed' || status === 'cancelled';

  const pickupCoords = activeTrip ? resolveTripPickupCoords(activeTrip) : null;
  const pickupCoord =
    pickupCoords?.lat != null && pickupCoords?.lng != null
      ? { latitude: pickupCoords.lat, longitude: pickupCoords.lng }
      : null;
  const pickupDisplayAddress = getTripPickupDisplayAddress(activeTrip);
  const destinationDisplayAddress = getTripDestinationDisplayAddress(activeTrip);

  const destinationCoords = activeTrip ? resolveTripFinalDestCoords(activeTrip) : null;
  const destinationCoord =
    destinationCoords?.lat != null && destinationCoords?.lng != null
      ? { latitude: destinationCoords.lat, longitude: destinationCoords.lng }
      : null;

  const isEnRouteToPickup = status === 'accepted' || status === 'going_to_pickup';
  const isEnRouteToDestination = status === 'in_progress';

  const routeTargetCoord = useMemo(() => {
    if (isEnRouteToDestination) {
      if (destinationCoords?.lat == null || destinationCoords?.lng == null) return null;
      return { latitude: destinationCoords.lat, longitude: destinationCoords.lng };
    }
    if (pickupCoords?.lat == null || pickupCoords?.lng == null) return null;
    return { latitude: pickupCoords.lat, longitude: pickupCoords.lng };
  }, [
    isEnRouteToDestination,
    pickupCoords?.lat,
    pickupCoords?.lng,
    destinationCoords?.lat,
    destinationCoords?.lng,
  ]);

  const routeTargetKey = routeTargetCoord
    ? `${Number(routeTargetCoord.latitude).toFixed(5)},${Number(routeTargetCoord.longitude).toFixed(5)}`
    : null;

  const tripPrice =
    activeTrip?.price != null && Number.isFinite(Number(activeTrip.price))
      ? Number(activeTrip.price)
      : null;
  const tripDistanceKm =
    activeTrip?.distance_km != null && Number.isFinite(Number(activeTrip.distance_km))
      ? Number(activeTrip.distance_km)
      : null;

  const showDriverCard = useMemo(
    () => driver != null && ['accepted', 'going_to_pickup', 'in_progress'].includes(status),
    [driver, status]
  );

  useEffect(() => {
    if (!enabled || !activeTrip?.id) return undefined;
    let cancelled = false;
    fetchTrip(activeTrip.id, activeTrip.tracking_token).then((trip) => {
      if (!cancelled && trip) setActiveTrip(trip);
    });
    return () => { cancelled = true; };
  }, [enabled, activeTrip?.id, activeTrip?.tracking_token, fetchTrip, setActiveTrip]);

  useEffect(() => {
    if (!enabled || !activeTrip?.driver_id) return undefined;
    fetchDriver(activeTrip.driver_id).then((d) => {
      if (!d) return;
      setDriver(d);
      if (d.current_lat != null && d.current_lng != null) {
        updateDriverLocation({
          latitude: Number(d.current_lat),
          longitude: Number(d.current_lng),
        });
      }
    });
    return undefined;
  }, [enabled, activeTrip?.driver_id, fetchDriver, updateDriverLocation]);

  const displayRouteCoords = useMemo(() => {
    if (isEnRouteToDestination && tripRouteCoords.length >= 2) return tripRouteCoords;
    if (isEnRouteToPickup && driverRouteCoords.length >= 2) return driverRouteCoords;
    if (tripRouteCoords.length >= 2) return tripRouteCoords;
    return driverRouteCoords;
  }, [isEnRouteToDestination, isEnRouteToPickup, tripRouteCoords, driverRouteCoords]);

  const snappedDriverCoord = useMemo(() => {
    if (!driverLocation) return null;
    if (displayRouteCoords.length < 2) return driverLocation;
    return snapToRoute(driverLocation, displayRouteCoords);
  }, [driverLocation, displayRouteCoords]);

  const distanceToTarget = useMemo(() => {
    if (!snappedDriverCoord || !routeTargetCoord) return null;
    return haversineMeters(snappedDriverCoord, routeTargetCoord);
  }, [snappedDriverCoord, routeTargetCoord]);

  const driverNearTarget = distanceToTarget != null && distanceToTarget < 200;

  const cfg = useMemo(() => {
    if (!baseCfg) return null;
    if (
      status === 'going_to_pickup'
      && distanceToTarget != null
      && distanceToTarget <= 50
    ) {
      return {
        ...baseCfg,
        label: 'Tu chofer llegó',
        desc: 'Salí a encontrarlo en el punto de retiro',
        progress: 0.95,
      };
    }
    if (
      (status === 'going_to_pickup' || status === 'accepted')
      && distanceToTarget != null
      && distanceToTarget < 200
    ) {
      return {
        ...baseCfg,
        desc: distanceToTarget <= 120 ? 'Está a la vuelta de la esquina' : 'Tu chofer se acerca',
        progress: Math.min(0.92, baseCfg.progress + 0.12),
      };
    }
    return baseCfg;
  }, [baseCfg, status, distanceToTarget]);

  const smoothDriverCoord = useSmoothMapPosition(
    snappedDriverCoord,
    driverNearTarget ? 600 : 1100
  );

  const remainingPath = useMemo(() => {
    if (isSearching || !smoothDriverCoord || !routeTargetCoord) return [];
    if (displayRouteCoords.length < 2) return [];
    return buildPassengerRemainingPath(smoothDriverCoord, displayRouteCoords, routeTargetCoord);
  }, [isSearching, smoothDriverCoord, displayRouteCoords, routeTargetCoord]);

  const routeHeading = useMemo(() => {
    if (!smoothDriverCoord || displayRouteCoords.length < 2) return null;
    const ahead = getPointAheadOnRoute(smoothDriverCoord, displayRouteCoords, 24);
    if (!ahead) return null;
    return getBearing(smoothDriverCoord, ahead);
  }, [smoothDriverCoord, displayRouteCoords]);

  useEffect(() => {
    const target = Number.isFinite(driverLocation?.heading)
      ? driverLocation.heading
      : routeHeading;
    if (!Number.isFinite(target)) return undefined;

    let frame;
    const animate = () => {
      const next = smoothAngle(headingRef.current, target, 0.2);
      headingRef.current = next;
      setMarkerHeading(next);
      if (Math.abs(((target - next + 540) % 360) - 180) > 0.4) {
        frame = requestAnimationFrame(animate);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [driverLocation?.heading, routeHeading]);

  useEffect(() => {
    tripMapFittedRef.current = false;
    setTripRouteCoords([]);
    setDriverRouteCoords([]);
    lastRouteOriginRef.current = null;
    lastRouteFetchAtRef.current = 0;
  }, [activeTrip?.id]);

  useEffect(() => {
    if (status === 'in_progress') {
      setDriverRouteCoords([]);
      lastRouteOriginRef.current = null;
    }
  }, [status]);

  // Ruta completa del viaje (recogida → destino)
  useEffect(() => {
    if (!enabled || !pickupCoord || !destinationCoord) return undefined;
    if (!['queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress'].includes(status)) return undefined;

    let cancelled = false;
    getDirections(pickupCoord, destinationCoord)
      .then((result) => {
        if (!cancelled && result?.polylineCoords?.length >= 2) {
          setTripRouteCoords(result.polylineCoords);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [
    enabled,
    pickupCoord?.latitude,
    pickupCoord?.longitude,
    destinationCoord?.latitude,
    destinationCoord?.longitude,
    status,
    activeTrip?.id,
  ]);

  // Encuadre fijo: mostrar toda la ruta del viaje una sola vez
  useEffect(() => {
    if (!enabled || !mapRef?.current || tripMapFittedRef.current) return undefined;
    if (!['accepted', 'going_to_pickup', 'in_progress'].includes(status)) return undefined;

    const edgePadding = {
      top: topInset + 64,
      right: 52,
      bottom: sheetBottom + 110,
      left: 52,
    };

    if (tripRouteCoords.length >= 2) {
      tripMapFittedRef.current = true;
      mapRef.current.fitToCoordinates(tripRouteCoords, {
        edgePadding,
        animated: true,
      });
      return undefined;
    }

    const timer = setTimeout(() => {
      if (tripMapFittedRef.current || !mapRef?.current) return;
      if (!pickupCoord || !destinationCoord) return;
      tripMapFittedRef.current = true;
      mapRef.current.fitToCoordinates([pickupCoord, destinationCoord], {
        edgePadding,
        animated: true,
      });
    }, 2800);

    return () => clearTimeout(timer);
  }, [
    enabled,
    status,
    tripRouteCoords,
    pickupCoord,
    destinationCoord,
    topInset,
    sheetBottom,
    mapRef,
  ]);

  // Ruta dinámica conductor → objetivo actual (solo al ir al punto de recogida)
  useEffect(() => {
    if (!enabled || !driverLocation || !routeTargetCoord) return undefined;
    if (!isEnRouteToPickup) return undefined;

    let cancelled = false;

    const fetchRoute = async (force = false) => {
      if (routeFetchInFlightRef.current) return;

      const distToTarget = haversineMeters(driverLocation, routeTargetCoord);
      if (distToTarget < 95 && driverRouteCoords.length >= 2) return;

      const movedEnough = !lastRouteOriginRef.current
        || haversineMeters(driverLocation, lastRouteOriginRef.current) >= ROUTE_MOVE_THRESHOLD_M;
      const stale = Date.now() - lastRouteFetchAtRef.current >= ROUTE_REFRESH_MS;

      if (!force && !movedEnough && !stale) return;

      routeFetchInFlightRef.current = true;
      try {
        const result = await getDirections(driverLocation, routeTargetCoord);
        if (cancelled) return;
        if (result?.polylineCoords?.length >= 2) {
          setDriverRouteCoords(result.polylineCoords);
          lastRouteOriginRef.current = { ...driverLocation };
          lastRouteFetchAtRef.current = Date.now();
        }
      } finally {
        routeFetchInFlightRef.current = false;
      }
    };

    fetchRoute(true);
    const intervalId = setInterval(() => {
      fetchRoute(false);
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    enabled,
    driverLocation?.latitude,
    driverLocation?.longitude,
    routeTargetKey,
    isEnRouteToPickup,
    routeTargetCoord,
    driverRouteCoords.length,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (status === 'completed') {
      setTripRouteCoords([]);
      setDriverRouteCoords([]);
      setShowCompletionOverlay(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (status === 'cancelled') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [enabled, status]);

  useEffect(() => {
    if (!enabled || status !== 'completed' || !activeTrip?.id || !profile?.phone) return;
    if (recordedDestinationTripRef.current === activeTrip.id) return;
    recordedDestinationTripRef.current = activeTrip.id;
    recordTripDestination(profile.phone, activeTrip);
  }, [enabled, status, activeTrip, profile?.phone]);

  const handleCancel = useCallback(() => {
    if (!activeTrip?.id) return null;

    return {
      title: isSearching ? 'Cancelar solicitud' : 'Cancelar viaje',
      message: isSearching
        ? '¿Confirmás que querés cancelar la búsqueda de conductor?'
        : '¿Confirmás que querés cancelar este viaje?',
      onConfirm: async () => {
        setIsCancelling(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        const result = await cancelTrip(activeTrip.id);
        setIsCancelling(false);
        return result;
      },
    };
  }, [activeTrip?.id, cancelTrip, isSearching]);

  const handleFinish = useCallback(async () => {
    await clearActiveTrip();
    setDriver(null);
    setTripRouteCoords([]);
    setDriverRouteCoords([]);
    setShowCompletionOverlay(false);
  }, [clearActiveTrip]);

  const handleCompletionFinished = useCallback(async () => {
    await handleFinish();
  }, [handleFinish]);

  return {
    status,
    cfg,
    isSearching,
    isFinished,
    isEnRouteToPickup,
    isEnRouteToDestination,
    driver,
    showDriverCard,
    pickupDisplayAddress,
    destinationDisplayAddress,
    pickupCoord,
    destinationCoord,
    smoothDriverCoord,
    markerHeading,
    remainingPath,
    fullTripRoute: tripRouteCoords,
    driverNearTarget,
    tripPrice,
    tripDistanceKm,
    isCancelling,
    showCompletionOverlay,
    handleCancel,
    handleFinish,
    handleCompletionFinished,
    showDriverOnMap: Boolean(cfg?.showDriver),
  };
}
