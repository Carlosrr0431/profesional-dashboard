'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, DEFAULT_MAP_VIEW } from '../../lib/mapLibre';
import { polylineHeading, remainingPolyline, snapToPolyline, smoothAngle, offsetAlongBearing } from './nav';

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
const NAV_PADDING = { top: 240, bottom: 150, left: 44, right: 44 };
const NAV_LOOKAHEAD_M = 22;

function DriverArrow({ heading = 0 }) {
  return (
    <img
      src="/driver-nav-puck.svg"
      alt="Conductor"
      width={72}
      height={72}
      style={{
        transform: `rotate(${Number.isFinite(heading) ? heading : 0}deg)`,
        filter: 'drop-shadow(0 6px 10px rgba(15,23,42,0.35))',
      }}
    />
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
}) {
  const mapRef = useRef(null);
  const navReadyRef = useRef(false);
  const lastBearingRef = useRef(null);
  const view = center || DEFAULT_MAP_VIEW;
  const [failed, setFailed] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const useArrow = driverIcon === 'arrow' || navigationMode;

  const snapped = useMemo(() => {
    if (!driver || driver.lat == null || driver.lng == null) return null;
    if (!navigationMode || !Array.isArray(routeCoords) || routeCoords.length < 2) {
      return { lat: driver.lat, lng: driver.lng };
    }
    const hit = snapToPolyline(routeCoords, driver.lat, driver.lng);
    return hit ? { lat: hit.lat, lng: hit.lng } : { lat: driver.lat, lng: driver.lng };
  }, [navigationMode, routeCoords, driver?.lat, driver?.lng]);

  const displayRoute = useMemo(() => {
    if (navigationMode && snapped) {
      return remainingPolyline(routeCoords, snapped.lat, snapped.lng);
    }
    return routeCoords;
  }, [navigationMode, routeCoords, snapped?.lat, snapped?.lng]);

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
        duration: 220,
        essential: true,
      });
      return;
    }

    navReadyRef.current = false;
    lastBearingRef.current = null;
    const target = followDriver && driver
      ? { lng: driver.lng, lat: driver.lat }
      : center
        ? { lng: center.longitude ?? center.lng, lat: center.latitude ?? center.lat }
        : null;
    if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return;
    map.easeTo({
      center: [target.lng, target.lat],
      zoom,
      pitch: 0,
      bearing: 0,
      duration: 400,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  }, [
    center?.latitude,
    center?.longitude,
    center?.lat,
    center?.lng,
    driver?.lat,
    driver?.lng,
    followDriver,
    navigationMode,
    snapped?.lat,
    snapped?.lng,
    zoom,
    mapLoaded,
  ]);

  if (failed) {
    return <div className="h-full w-full bg-[#d9e2ec]" />;
  }

  const routeEnd = Array.isArray(displayRoute) && displayRoute.length > 0
    ? displayRoute[displayRoute.length - 1]
    : null;
  const marker = snapped || driver;

  return (
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
          <Layer {...(navigationMode ? NAV_ROUTE_BORDER : OVERVIEW_ROUTE_BORDER)} />
          <Layer {...(navigationMode ? NAV_ROUTE_LINE : OVERVIEW_ROUTE_LINE)} />
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
          rotation={navigationMode ? 0 : (useArrow ? arrowHeading : 0)}
          rotationAlignment={navigationMode ? 'viewport' : 'map'}
          pitchAlignment={navigationMode ? 'viewport' : 'map'}
        >
          {useArrow ? (
            <DriverArrow heading={0} />
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
  );
}
