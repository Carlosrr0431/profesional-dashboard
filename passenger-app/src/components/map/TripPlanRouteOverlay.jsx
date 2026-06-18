import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getDirections } from '../../services/googleMaps';
import { ROUTE_CASING, ROUTE_LINE } from '../../constants/mapStyle';
import { MapRouteLayers } from './MapRouteLayers';
import PickupMarker from './PickupMarker';
import NumberedStopMarker from './NumberedStopMarker';

function toCoord(place) {
  const lat = Number(place?.lat ?? place?.latitude);
  const lng = Number(place?.lng ?? place?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * Ruta completa recogida → parada 1 → … → destino en el mapa del home.
 */
export default function TripPlanRouteOverlay({
  pickup,
  paradas = [],
  mapRef,
  mapPadding = { top: 120, right: 52, bottom: 220, left: 68 },
}) {
  const [routeCoords, setRouteCoords] = useState([]);
  const routeCoordsRef = useRef([]);
  const mapPaddingRef = useRef(mapPadding);
  mapPaddingRef.current = mapPadding;

  const pickupCoord = toCoord(pickup);
  const stopCoords = (paradas || [])
    .map((parada) => toCoord(parada))
    .filter(Boolean);
  const routeKey = [
    pickupCoord?.latitude,
    pickupCoord?.longitude,
    ...stopCoords.flatMap((coord) => [coord.latitude, coord.longitude]),
  ].join(',');

  const fitRouteToMap = useCallback((coords, animated = true) => {
    if (!mapRef?.current || !Array.isArray(coords) || coords.length < 2) return;

    const markerPoints = [pickupCoord, ...stopCoords].filter(Boolean);
    const fitPoints = coords.length > 1 ? coords : markerPoints;
    if (fitPoints.length < 2) return;

    mapRef.current.fitToCoordinates(fitPoints, {
      edgePadding: mapPaddingRef.current,
      animated,
    });
  }, [mapRef, pickupCoord, stopCoords]);

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
        const coords = result?.polylineCoords || [];
        routeCoordsRef.current = coords;
        setRouteCoords(coords);
        fitRouteToMap(coords, true);
      })
      .catch(() => {
        if (!cancelled) {
          routeCoordsRef.current = [];
          setRouteCoords([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [routeKey, fitRouteToMap, pickupCoord, stopCoords]);

  useEffect(() => {
    if (routeCoordsRef.current.length < 2) return undefined;
    const timer = setTimeout(() => {
      fitRouteToMap(routeCoordsRef.current, false);
    }, 120);
    return () => clearTimeout(timer);
  }, [
    mapPadding.top,
    mapPadding.right,
    mapPadding.bottom,
    mapPadding.left,
    fitRouteToMap,
  ]);

  if (!pickupCoord || stopCoords.length === 0) return null;

  return (
    <>
      <PickupMarker coordinate={pickupCoord} />

      {stopCoords.map((coord, index) => (
        <NumberedStopMarker
          key={`stop-${index}-${coord.latitude}-${coord.longitude}`}
          coordinate={coord}
          index={index + 1}
          isFinal={index === stopCoords.length - 1}
        />
      ))}

      {routeCoords.length > 1 ? (
        <MapRouteLayers
          idPrefix="plan-route"
          coords={routeCoords}
          lineColor={ROUTE_LINE}
          casingColor={ROUTE_CASING}
          casingWidth={10}
          lineWidth={5}
        />
      ) : null}
    </>
  );
}
