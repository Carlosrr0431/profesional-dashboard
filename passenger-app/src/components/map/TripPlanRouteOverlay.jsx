import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getDirections } from '../../services/googleMaps';
import { filterCoordsInSaltaCapital } from '../../utils/mapCoords';
import { MapRouteLayers } from './MapRouteLayers';
import PickupMarker from './PickupMarker';
import NumberedStopMarker from './NumberedStopMarker';
import DestinationMarker from './DestinationMarker';

function toCoord(place) {
  const lat = Number(place?.lat ?? place?.latitude);
  const lng = Number(place?.lng ?? place?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

function buildRouteFitPadding(mapPadding = {}) {
  return {
    top: Math.round((mapPadding.top ?? 96) * 0.9),
    right: Math.round((mapPadding.right ?? 48) * 0.75),
    bottom: Math.round((mapPadding.bottom ?? 220) * 0.9),
    left: Math.round((mapPadding.left ?? 64) * 0.75),
  };
}

/**
 * Ruta completa recogida → parada 1 → … → destino en el mapa del home.
 */
export default function TripPlanRouteOverlay({
  pickup,
  paradas = [],
  mapRef,
  mapPadding = { top: 120, right: 52, bottom: 220, left: 68 },
  userMovedMapRef,
}) {
  const [routeCoords, setRouteCoords] = useState([]);
  const routeCoordsRef = useRef([]);
  const mapPaddingRef = useRef(mapPadding);
  const lastFittedRouteKeyRef = useRef('');
  mapPaddingRef.current = mapPadding;

  const pickupCoord = useMemo(() => toCoord(pickup), [pickup?.lat, pickup?.lng]);
  const stopCoords = useMemo(
    () => (paradas || []).map((parada) => toCoord(parada)).filter(Boolean),
    [paradas],
  );

  const markerPoints = useMemo(
    () => [pickupCoord, ...stopCoords].filter(Boolean),
    [pickupCoord, stopCoords],
  );

  const routeKey = markerPoints
    .map((coord) => `${coord.latitude.toFixed(5)},${coord.longitude.toFixed(5)}`)
    .join('|');

  useEffect(() => {
    lastFittedRouteKeyRef.current = '';
    if (userMovedMapRef) userMovedMapRef.current = false;
  }, [routeKey, userMovedMapRef]);

  const fitRouteToMap = useCallback((coords, { animated = true, force = false } = {}) => {
    if (!mapRef?.current || markerPoints.length < 2) return;
    if (!force && userMovedMapRef?.current) return;
    if (!force && lastFittedRouteKeyRef.current === routeKey) return;

    const fitPadding = buildRouteFitPadding(mapPaddingRef.current);
    const routePoints = (coords || []).filter(
      (point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude),
    );
    const fitTarget = routePoints.length > 1 ? routePoints : markerPoints;
    const preferFullRouteFit = fitTarget.length > 2;

    if (preferFullRouteFit && typeof mapRef.current.fitToCoordinates === 'function') {
      mapRef.current.fitToCoordinates(fitTarget, {
        edgePadding: fitPadding,
        animated,
      });
    } else if (typeof mapRef.current.fitRouteToCoordinates === 'function') {
      mapRef.current.fitRouteToCoordinates(fitTarget, {
        edgePadding: fitPadding,
        animated,
      });
    } else {
      mapRef.current.fitToCoordinates(fitTarget, {
        edgePadding: fitPadding,
        animated,
      });
    }

    lastFittedRouteKeyRef.current = routeKey;
  }, [mapRef, markerPoints, routeKey, userMovedMapRef]);

  const applyRouteToMap = useCallback((coords, animated = true) => {
    const safeCoords = filterCoordsInSaltaCapital(coords || []);
    if (safeCoords.length > 1) {
      routeCoordsRef.current = safeCoords;
      setRouteCoords(safeCoords);
      fitRouteToMap(safeCoords, { animated });
      return;
    }

    if (markerPoints.length >= 2) {
      routeCoordsRef.current = markerPoints;
      setRouteCoords(markerPoints);
      fitRouteToMap(markerPoints, { animated });
    }
  }, [fitRouteToMap, markerPoints]);

  useEffect(() => {
    if (!pickupCoord || stopCoords.length === 0) {
      routeCoordsRef.current = [];
      setRouteCoords([]);
      return undefined;
    }

    let cancelled = false;
    const finalCoord = stopCoords[stopCoords.length - 1];
    const waypointCoords = stopCoords.length > 1 ? stopCoords.slice(0, -1) : [];

    getDirections(pickupCoord, finalCoord, waypointCoords)
      .then((result) => {
        if (cancelled) return;
        const coords = filterCoordsInSaltaCapital(result?.polylineCoords || []);
        if (coords.length > 1) {
          applyRouteToMap(coords, true);
          return;
        }
        applyRouteToMap(null, true);
      })
      .catch(() => {
        if (!cancelled) applyRouteToMap(null, true);
      });

    return () => {
      cancelled = true;
    };
  }, [routeKey, applyRouteToMap, pickupCoord, stopCoords]);

  if (!pickupCoord || stopCoords.length === 0) return null;

  return (
    <>
      {routeCoords.length > 1 ? (
        <MapRouteLayers
          coords={routeCoords}
          variant="preview"
          idPrefix="trip-preview-route"
        />
      ) : null}

      <PickupMarker coordinate={pickupCoord} />

      {stopCoords.map((coord, index) => {
        const isFinal = index === stopCoords.length - 1;
        const hasIntermediateStops = stopCoords.length > 1;

        if (isFinal) {
          return (
            <DestinationMarker
              key={`dest-${coord.latitude}-${coord.longitude}`}
              coordinate={coord}
              label={hasIntermediateStops ? 'Destino final' : 'Destino'}
            />
          );
        }

        return (
          <NumberedStopMarker
            key={`stop-${index}-${coord.latitude}-${coord.longitude}`}
            coordinate={coord}
            index={index + 1}
            isFinal={false}
            caption={`Parada ${index + 1}`}
          />
        );
      })}
    </>
  );
}
