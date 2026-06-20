'use client';

import React, { memo, useCallback, useRef, useEffect, useState } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SALTA_CENTER, DEFAULT_ZOOM } from '../lib/constants';
import {
  buildDriverMarkerIconSpec,
  buildPassengerMarkerIconSpec,
} from '../lib/driverMarkerIcon';
import DriverInfoWindow from './DriverInfoWindow';
import PassengerInfoWindow from './PassengerInfoWindow';

/*
 * OpenFreeMap "bright" — estilo vectorial idéntico a Google Maps.
 * Fondo blanco, calles con jerarquía de color, íconos de POI, zonas verdes.
 * Completamente gratuito y sin límite de uso.
 */
const BRIGHT_STYLE = 'https://tiles.openfreemap.org/styles/bright';

/* ── Estilos CSS globales para los controles ─────────────────────────────── */
const MAP_CSS = `
.maplibregl-map { font-family: 'Roboto', 'Inter', system-ui, sans-serif !important; }

/* Controles de zoom — estilo Google Maps */
.maplibregl-ctrl-group {
  border-radius: 2px !important;
  box-shadow: 0 1px 5px rgba(0,0,0,0.22) !important;
  border: none !important;
  overflow: hidden !important;
}
.maplibregl-ctrl-group button {
  width: 28px !important;
  height: 28px !important;
  background: #fff !important;
  border: none !important;
  cursor: pointer !important;
}
.maplibregl-ctrl-group button:hover { background: #F1F5F9 !important; }
.maplibregl-ctrl-group button + button { border-top: 1px solid #E2E8F0 !important; }

/* Atribución discreta */
.maplibregl-ctrl-attrib {
  font-size: 10px !important;
  background: rgba(255,255,255,0.72) !important;
  backdrop-filter: blur(4px) !important;
  border-radius: 4px 0 0 0 !important;
  padding: 2px 6px !important;
}
.maplibregl-ctrl-logo { display: none !important; }

/* Popup limpio estilo Google Maps */
.maplibregl-popup-content {
  padding: 0 !important;
  border-radius: 14px !important;
  overflow: hidden !important;
  box-shadow: 0 8px 32px rgba(15,23,42,0.20), 0 2px 8px rgba(15,23,42,0.10) !important;
  border: 1px solid rgba(226,232,240,0.9) !important;
  background: #fff !important;
  min-width: 0 !important;
}
.maplibregl-popup-close-button { display: none !important; }
.maplibregl-popup-tip { display: none !important; }
.maplibregl-popup { filter: drop-shadow(0 6px 20px rgba(15,23,42,0.15)) !important; }
`;

/* ── Capas de la ruta OSRM ────────────────────────────────────────────────── */
const ROUTE_BORDER_LAYER = {
  id: 'route-border',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#7F1D1D', 'line-width': 12, 'line-opacity': 0.12 },
};
const ROUTE_LINE_LAYER = {
  id: 'route-line',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': '#DC2626',
    'line-width': 5,
    'line-opacity': 0.92,
    'line-dasharray': [0, 0],
  },
};
const ROUTE_ORIGIN_LAYER = {
  id: 'route-origin',
  type: 'circle',
  paint: { 'circle-radius': 9, 'circle-color': '#DC2626', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' },
};
const ROUTE_DEST_LAYER = {
  id: 'route-dest',
  type: 'circle',
  paint: { 'circle-radius': 9, 'circle-color': '#1D4ED8', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' },
};

/* ── Utilidades ──────────────────────────────────────────────────────────── */
function buildRouteGeoJSON(polylineCoords) {
  if (!polylineCoords?.length) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: polylineCoords.map((p) => [Number(p.lng), Number(p.lat)]),
    },
  };
}

function buildPointGeoJSON(lat, lng) {
  if (!lat || !lng) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
  };
}

/* ── Componente MapView ───────────────────────────────────────────────────── */
const MapView = memo(function MapView({
  mapRef,
  drivers = [],
  trips = [],
  selectedDriverId,
  onDriverClick,
  onAssignTrip,
  previewRoute,
}) {
  const [activeInfo, setActiveInfo] = useState(null);

  /* Exponer la API del mapa al padre vía mapRef */
  const internalMapRef = useRef(null);
  useEffect(() => {
    if (!mapRef) return;
    mapRef.current = internalMapRef.current
      ? {
          flyTo: (opts) => internalMapRef.current.flyTo(opts),
          fitBounds: (bounds, opts) => internalMapRef.current.fitBounds(bounds, opts),
          getMap: () => internalMapRef.current,
        }
      : null;
  });

  /* Cierrar popup al hacer click en el mapa */
  const handleMapClick = useCallback(() => {
    setActiveInfo(null);
  }, []);

  /* Calcular GeoJSON de ruta */
  const routeGeoJSON     = buildRouteGeoJSON(previewRoute?.polylineCoords);
  const routeOriginJSON  = buildPointGeoJSON(previewRoute?.origin?.lat, previewRoute?.origin?.lng);
  const routeDestJSON    = buildPointGeoJSON(previewRoute?.destination?.lat, previewRoute?.destination?.lng);

  /* Auto-zoom cuando llega la ruta */
  useEffect(() => {
    if (!previewRoute?.polylineCoords?.length || !internalMapRef.current) return;
    const coords = previewRoute.polylineCoords;
    const lngs = coords.map((p) => Number(p.lng));
    const lats = coords.map((p) => Number(p.lat));
    const swLng = Math.min(...lngs) - 0.002;
    const swLat = Math.min(...lats) - 0.002;
    const neLng = Math.max(...lngs) + 0.002;
    const neLat = Math.max(...lats) + 0.002;
    internalMapRef.current.fitBounds([[swLng, swLat], [neLng, neLat]], { padding: 72, duration: 900 });
  }, [previewRoute]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <style>{MAP_CSS}</style>
      <Map
        ref={internalMapRef}
        mapStyle={BRIGHT_STYLE}
        initialViewState={{
          longitude: SALTA_CENTER.lng,
          latitude: SALTA_CENTER.lat,
          zoom: DEFAULT_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        onClick={handleMapClick}
        reuseMaps
      >
        <NavigationControl position="top-left" showCompass={false} />

        {/* ── Ruta OSRM ──────────────────────────────────────────────── */}
        {routeGeoJSON && (
          <Source id="route-source" type="geojson" data={routeGeoJSON}>
            <Layer {...ROUTE_BORDER_LAYER} />
            <Layer {...ROUTE_LINE_LAYER} />
          </Source>
        )}
        {routeOriginJSON && (
          <Source id="route-origin-source" type="geojson" data={routeOriginJSON}>
            <Layer {...ROUTE_ORIGIN_LAYER} />
          </Source>
        )}
        {routeDestJSON && (
          <Source id="route-dest-source" type="geojson" data={routeDestJSON}>
            <Layer {...ROUTE_DEST_LAYER} />
          </Source>
        )}

        {/* ── Marcadores de conductores ──────────────────────────────── */}
        {drivers.map((driver) => {
          if (!driver.lat || !driver.lng) return null;
          const spec = buildDriverMarkerIconSpec(driver);
          const isSelected = driver.id === selectedDriverId;
          return (
            <Marker
              key={driver.id}
              longitude={Number(driver.lng)}
              latitude={Number(driver.lat)}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setActiveInfo({ type: 'driver', data: driver });
                onDriverClick?.(driver);
              }}
            >
              <div style={{
                position: 'relative', cursor: 'pointer',
                filter: isSelected ? 'drop-shadow(0 0 6px rgba(220,38,38,0.8))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.28))',
                transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                transition: 'transform 0.15s, filter 0.15s',
              }}>
                <div
                  dangerouslySetInnerHTML={{ __html: spec.svg || '' }}
                  style={{ width: spec.size?.[0] ?? 44, height: spec.size?.[1] ?? 50, display: 'block' }}
                />
              </div>
            </Marker>
          );
        })}

        {/* ── Marcadores de viajes en curso ─────────────────────────── */}
        {trips.map((trip) => {
          const pasLat = Number(trip.passenger_lat ?? trip.pickup_lat);
          const pasLng = Number(trip.passenger_lng ?? trip.pickup_lng);
          if (!Number.isFinite(pasLat) || !Number.isFinite(pasLng)) return null;
          const spec = buildPassengerMarkerIconSpec(trip);
          return (
            <Marker
              key={`trip-${trip.id}`}
              longitude={pasLng}
              latitude={pasLat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setActiveInfo({ type: 'trip', data: trip });
              }}
            >
              <div style={{ cursor: 'pointer', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.28))' }}>
                <div
                  dangerouslySetInnerHTML={{ __html: spec.svg || '' }}
                  style={{ width: spec.size?.[0] ?? 36, height: spec.size?.[1] ?? 36, display: 'block' }}
                />
              </div>
            </Marker>
          );
        })}

        {/* ── Popup conductor ───────────────────────────────────────── */}
        {activeInfo?.type === 'driver' && (
          <Popup
            longitude={Number(activeInfo.data.lng)}
            latitude={Number(activeInfo.data.lat)}
            anchor="bottom"
            offset={[0, -8]}
            onClose={() => setActiveInfo(null)}
            closeOnClick={false}
            maxWidth="320px"
          >
            <DriverInfoWindow
              driver={activeInfo.data}
              onAssignTrip={(d) => { setActiveInfo(null); onAssignTrip?.(d); }}
              onClose={() => setActiveInfo(null)}
            />
          </Popup>
        )}

        {/* ── Popup pasajero ────────────────────────────────────────── */}
        {activeInfo?.type === 'trip' && (
          <Popup
            longitude={Number(activeInfo.data.passenger_lng ?? activeInfo.data.pickup_lng)}
            latitude={Number(activeInfo.data.passenger_lat ?? activeInfo.data.pickup_lat)}
            anchor="bottom"
            offset={[0, -8]}
            onClose={() => setActiveInfo(null)}
            closeOnClick={false}
            maxWidth="300px"
          >
            <PassengerInfoWindow
              trip={activeInfo.data}
              onClose={() => setActiveInfo(null)}
            />
          </Popup>
        )}
      </Map>
    </div>
  );
});

export default MapView;
