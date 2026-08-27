'use client';

import { useEffect, useMemo, useRef } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, DEFAULT_MAP_VIEW } from '../../lib/mapLibre';

const ROUTE_BORDER = {
  id: 'spa-route-border',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.95 },
};

const ROUTE_LINE = {
  id: 'spa-route-line',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#245f8d', 'line-width': 4, 'line-opacity': 1 },
};

export default function SpaMap({
  center,
  zoom = 14,
  pickup,
  dropoff,
  driver,
  routeCoords,
  followDriver = false,
}) {
  const mapRef = useRef(null);
  const view = center || DEFAULT_MAP_VIEW;

  const routeGeo = useMemo(() => {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: routeCoords },
    };
  }, [routeCoords]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    const target = followDriver && driver
      ? { lng: driver.lng, lat: driver.lat }
      : center
        ? { lng: center.longitude ?? center.lng, lat: center.latitude ?? center.lat }
        : null;
    if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return;
    map.easeTo({
      center: [target.lng, target.lat],
      zoom,
      duration: 700,
    });
  }, [center?.latitude, center?.longitude, center?.lat, center?.lng, driver?.lat, driver?.lng, followDriver, zoom]);

  return (
    <Map
      ref={mapRef}
      mapStyle={MAP_STYLE}
      initialViewState={{
        longitude: view.longitude ?? view.lng ?? DEFAULT_MAP_VIEW.longitude,
        latitude: view.latitude ?? view.lat ?? DEFAULT_MAP_VIEW.latitude,
        zoom,
      }}
      attributionControl={false}
      reuseMaps
      style={{ width: '100%', height: '100%' }}
    >
      {routeGeo ? (
        <Source id="spa-route" type="geojson" data={routeGeo}>
          <Layer {...ROUTE_BORDER} />
          <Layer {...ROUTE_LINE} />
        </Source>
      ) : null}

      {pickup?.lat != null ? (
        <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
          <div className="flex flex-col items-center">
            <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[10px] font-semibold text-white">Origen</span>
            <span className="mt-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-accent shadow" />
          </div>
        </Marker>
      ) : null}

      {dropoff?.lat != null ? (
        <Marker longitude={dropoff.lng} latitude={dropoff.lat} anchor="bottom">
          <div className="flex flex-col items-center">
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">Destino</span>
            <span className="mt-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow" />
          </div>
        </Marker>
      ) : null}

      {driver?.lat != null ? (
        <Marker
          longitude={driver.lng}
          latitude={driver.lat}
          anchor="center"
          rotation={Number.isFinite(driver.heading) ? driver.heading : 0}
          rotationAlignment="map"
          pitchAlignment="map"
        >
          <img
            src="/tracking-car.png"
            alt="Conductor"
            width={36}
            height={66}
            style={{ filter: 'drop-shadow(0 6px 8px rgba(15,23,42,0.35))' }}
          />
        </Marker>
      ) : null}
    </Map>
  );
}
