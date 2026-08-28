'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, DEFAULT_MAP_VIEW } from '../../lib/mapLibre';
import { polylineHeading, remainingPolyline, snapToPolyline, smoothAngle, offsetAlongBearing } from './nav';
import { haptic } from './ui';

const OVERVIEW_ROUTE_BORDER = {
  id: 'spa-route-border',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.95 },
};

const OVERVIEW_ROUTE_LINE = {
  id: 'spa-route-line',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#245f8d', 'line-width': 4, 'line-opacity': 1 },
};

const NAV_ROUTE_BORDER = {
  id: 'spa-route-border',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#FFFFFF', 'line-width': 14, 'line-opacity': 0.95 },
};

const NAV_ROUTE_LINE = {
  id: 'spa-route-line',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#4285F4', 'line-width': 10, 'line-opacity': 0.94 },
};

const NAV_PITCH = 52;
const NAV_ZOOM = 17.4;
const NAV_PADDING = { top: 96, bottom: 340, left: 28, right: 28 };
const NAV_LOOKAHEAD_M = 22;
const FOLLOW_PADDING = { top: 96, bottom: 320, left: 36, right: 36 };

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DriverArrow() {
  return (
    <svg
      width="88"
      height="88"
      viewBox="0 0 96 96"
      aria-label="Conductor"
      style={{ display: 'block', filter: 'drop-shadow(0 6px 10px rgba(15,23,42,0.4))' }}
    >
      <circle cx="48" cy="48" r="22" fill="#ffffff" />
      <circle cx="48" cy="48" r="17" fill="#282e69" />
      <path d="M48 39 L53.25 54 L48 49.75 L42.75 54 Z" fill="#ffffff" />
    </svg>
  );
}

export default function SpaMap({
  center,
  zoom = 14,
  pickup,
  dropoff,
  driver,
  routeCoords,
  followDriver = false,
  navigationMode = false,
  driverIcon = 'car',
  showMapControls = false,
  fitToRoute = false,
}) {
  const mapRef = useRef(null);
  const navReadyRef = useRef(false);
  const lastBearingRef = useRef(null);
  const lastFitKeyRef = useRef('');
  const view = center || DEFAULT_MAP_VIEW;
  const [failed, setFailed] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [threeDEnabled, setThreeDEnabled] = useState(true);
  const [followTick, setFollowTick] = useState(0);
  const useArrow = driverIcon === 'arrow' || navigationMode;

  const snapped = useMemo(() => {
    if (!driver || driver.lat == null || driver.lng == null) return null;
    const canSnap = (navigationMode || followDriver) && Array.isArray(routeCoords) && routeCoords.length >= 2;
    if (!canSnap) return { lat: driver.lat, lng: driver.lng };
    const hit = snapToPolyline(routeCoords, driver.lat, driver.lng);
    return hit ? { lat: hit.lat, lng: hit.lng } : { lat: driver.lat, lng: driver.lng };
  }, [navigationMode, followDriver, routeCoords, driver?.lat, driver?.lng]);

  const displayRoute = useMemo(() => {
    if ((navigationMode || followDriver) && snapped && Array.isArray(routeCoords) && routeCoords.length >= 2) {
      return remainingPolyline(routeCoords, snapped.lat, snapped.lng);
    }
    return routeCoords;
  }, [navigationMode, followDriver, routeCoords, snapped?.lat, snapped?.lng]);

  const routeGeo = useMemo(() => {
    if (!Array.isArray(displayRoute) || displayRoute.length < 2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: displayRoute },
    };
  }, [displayRoute]);

  const arrowHeading = useMemo(() => {
    if (navigationMode && displayRoute?.length >= 2) return polylineHeading(displayRoute);
    return Number.isFinite(driver?.heading) ? driver.heading : 0;
  }, [navigationMode, displayRoute, driver?.heading]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded) return;

    if (navigationMode && snapped) {
      if (threeDEnabled) {
        const heading = displayRoute?.length >= 2 ? polylineHeading(displayRoute) : 0;
        const ahead = offsetAlongBearing(snapped.lat, snapped.lng, heading, NAV_LOOKAHEAD_M);
        const bearing = navReadyRef.current
          ? smoothAngle(lastBearingRef.current ?? heading, heading, 0.28)
          : heading;
        lastBearingRef.current = bearing;
        const camera = {
          center: [ahead.lng, ahead.lat],
          zoom: NAV_ZOOM,
          pitch: NAV_PITCH,
          bearing,
          padding: NAV_PADDING,
        };
        if (!navReadyRef.current) {
          map.jumpTo(camera);
          navReadyRef.current = true;
          return;
        }
        map.easeTo({
          center: camera.center,
          bearing,
          pitch: NAV_PITCH,
          padding: NAV_PADDING,
          duration: 220,
          essential: true,
        });
        return;
      }

      navReadyRef.current = false;
      lastBearingRef.current = null;
      map.easeTo({
        center: [snapped.lng, snapped.lat],
        zoom: NAV_ZOOM,
        pitch: 0,
        bearing: 0,
        padding: NAV_PADDING,
        duration: 280,
        essential: true,
      });
      return;
    }

    navReadyRef.current = false;
    lastBearingRef.current = null;
    if ((fitToRoute || (!showMapControls && followDriver)) && Array.isArray(routeCoords) && routeCoords.length >= 2) {
      const key = `${routeCoords.length}:${routeCoords[0]?.[0]}:${routeCoords[routeCoords.length - 1]?.[1]}`;
      if (lastFitKeyRef.current !== key) {
        lastFitKeyRef.current = key;
        const lngs = routeCoords.map((point) => Number(point[0]));
        const lats = routeCoords.map((point) => Number(point[1]));
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          {
            padding: fitToRoute
              ? { top: 96, bottom: 380, left: 40, right: 40 }
              : FOLLOW_PADDING,
            maxZoom: 16.4,
            duration: 700,
            essential: true,
          },
        );
      }
      return;
    }
    lastFitKeyRef.current = '';
    const target = followDriver && driver
      ? { lng: driver.lng, lat: driver.lat }
      : center
        ? { lng: center.longitude ?? center.lng, lat: center.latitude ?? center.lat }
        : null;
    if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return;
    const driver3d = Boolean(showMapControls && threeDEnabled);
    map.easeTo({
      center: [target.lng, target.lat],
      zoom: driver3d ? 16.2 : zoom,
      pitch: driver3d ? NAV_PITCH : 0,
      bearing: 0,
      duration: 400,
      padding: showMapControls
        ? { top: 88, bottom: 220, left: 24, right: 24 }
        : { top: 0, bottom: 0, left: 0, right: 0 },
    });
  }, [
    center?.latitude,
    center?.longitude,
    center?.lat,
    center?.lng,
    driver?.lat,
    driver?.lng,
    followDriver,
    followTick,
    fitToRoute,
    navigationMode,
    showMapControls,
    snapped?.lat,
    snapped?.lng,
    threeDEnabled,
    routeCoords,
    zoom,
    mapLoaded,
  ]);

  const headingUp = Boolean(navigationMode && threeDEnabled);

  const recenter = () => {
    haptic(10);
    navReadyRef.current = false;
    lastFitKeyRef.current = '';
    lastBearingRef.current = null;
    setFollowTick((n) => n + 1);
  };

  const toggleThreeD = () => {
    haptic(10);
    navReadyRef.current = false;
    lastBearingRef.current = null;
    setThreeDEnabled((prev) => !prev);
  };

  if (failed) {
    return <div className="h-full w-full bg-[#d9e2ec]" />;
  }

  const routeEnd = Array.isArray(displayRoute) && displayRoute.length > 0
    ? displayRoute[displayRoute.length - 1]
    : null;
  const marker = snapped || driver;

  return (
    <div className="spa-map-wrap">
    <Map
      ref={mapRef}
      mapStyle={MAP_STYLE}
      initialViewState={{
        longitude: view.longitude ?? view.lng ?? DEFAULT_MAP_VIEW.longitude,
        latitude: view.latitude ?? view.lat ?? DEFAULT_MAP_VIEW.latitude,
        zoom,
        pitch: 0,
        bearing: 0,
      }}
      maxPitch={60}
      attributionControl={false}
      reuseMaps
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      onLoad={() => setMapLoaded(true)}
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%' }}
    >
      {routeGeo ? (
        <Source id="spa-route" type="geojson" data={routeGeo}>
          <Layer {...(navigationMode || followDriver ? NAV_ROUTE_BORDER : OVERVIEW_ROUTE_BORDER)} />
          <Layer {...(navigationMode || followDriver ? NAV_ROUTE_LINE : OVERVIEW_ROUTE_LINE)} />
        </Source>
      ) : null}

      {!navigationMode && pickup?.lat != null ? (
        <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
          <div className="flex flex-col items-center">
            <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[10px] font-semibold text-white">Origen</span>
            <span className="mt-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-accent shadow" />
          </div>
        </Marker>
      ) : null}

      {!navigationMode && dropoff?.lat != null ? (
        <Marker longitude={dropoff.lng} latitude={dropoff.lat} anchor="bottom">
          <div className="flex flex-col items-center">
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">Destino</span>
            <span className="mt-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow" />
          </div>
        </Marker>
      ) : null}

      {navigationMode && routeEnd ? (
        <Marker longitude={routeEnd[0]} latitude={routeEnd[1]} anchor="bottom">
          <div className="flex flex-col items-center">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-navy-900 shadow" />
          </div>
        </Marker>
      ) : null}

      {marker?.lat != null ? (
        <Marker
          longitude={marker.lng}
          latitude={marker.lat}
          anchor="center"
          rotation={headingUp ? 0 : (useArrow ? arrowHeading : 0)}
          rotationAlignment={headingUp ? 'viewport' : 'map'}
          pitchAlignment={headingUp ? 'viewport' : 'map'}
        >
          {useArrow ? (
            <DriverArrow />
          ) : (
            <img
              src="/tracking-car.png"
              alt="Conductor"
              width={36}
              height={66}
              style={{ filter: 'drop-shadow(0 6px 8px rgba(15,23,42,0.35))' }}
            />
          )}
        </Marker>
      ) : null}
    </Map>
    {showMapControls ? (
      <div className="spa-map-controls">
        <button type="button" className="spa-map-btn" onClick={recenter} aria-label="Centrar ubicación">
          <LocateIcon />
        </button>
        <button
          type="button"
          className="spa-map-btn spa-map-btn--mode"
          onClick={toggleThreeD}
          aria-label={threeDEnabled ? 'Cambiar a vista 2D' : 'Cambiar a vista 3D'}
        >
          {threeDEnabled ? '2D' : '3D'}
        </button>
      </div>
    ) : null}
    </div>
  );
}
