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
import { MAP_STYLE } from '../lib/mapLibre';

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
  paint: { 'line-color': '#FFFFFF', 'line-width': 10, 'line-opacity': 0.9 },
};
const ROUTE_LINE_LAYER = {
  id: 'route-line',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': '#DC2626',
    'line-width': 5,
    'line-opacity': 0.92,
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

  useEffect(() => {
    if (activeInfo?.type !== 'driver') return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setActiveInfo(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeInfo?.type]);

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

  /* Auto-zoom cuando llega la ruta o un punto suelto de preview */
  useEffect(() => {
    if (!previewRoute || !internalMapRef.current) return;

    if (previewRoute?.polylineCoords?.length > 1) {
      const coords = previewRoute.polylineCoords;
      const lngs = coords.map((p) => Number(p.lng));
      const lats = coords.map((p) => Number(p.lat));
      const swLng = Math.min(...lngs) - 0.002;
      const swLat = Math.min(...lats) - 0.002;
      const neLng = Math.max(...lngs) + 0.002;
      const neLat = Math.max(...lats) + 0.002;
      internalMapRef.current.fitBounds([[swLng, swLat], [neLng, neLat]], { padding: 72, duration: 900 });
      return;
    }

    const lat = Number(previewRoute?.origin?.lat);
    const lng = Number(previewRoute?.origin?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      internalMapRef.current.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 900,
      });
    }
  }, [previewRoute]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <style>{MAP_CSS}</style>
      <Map
        ref={internalMapRef}
        mapStyle={MAP_STYLE}
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
          const isSelected = driver.id === selectedDriverId;
          const spec = buildDriverMarkerIconSpec(driver, isSelected, false);
          return (
            <Marker
              key={driver.id}
              longitude={Number(driver.lng)}
              latitude={Number(driver.lat)}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setActiveInfo({ type: 'driver', data: driver });
                onDriverClick?.(driver);
              }}
            >
              {/* spec.url es un data-URI SVG generado por buildDriverMarkerIconSpec */}
              <img
                src={spec.url}
                width={spec.width}
                height={spec.height}
                alt={driver.full_name ?? 'chofer'}
                style={{
                  cursor: 'pointer',
                  display: 'block',
                  transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                  filter: isSelected
                    ? 'drop-shadow(0 0 6px rgba(220,38,38,0.8))'
                    : 'drop-shadow(0 2px 5px rgba(0,0,0,0.35))',
                  transition: 'transform 0.15s, filter 0.15s',
                }}
              />
            </Marker>
          );
        })}

        {/* ── Marcadores de viajes en curso ─────────────────────────── */}
        {trips.map((trip) => {
          const pasLat = Number(trip.passenger_lat ?? trip.pickup_lat);
          const pasLng = Number(trip.passenger_lng ?? trip.pickup_lng);
          if (!Number.isFinite(pasLat) || !Number.isFinite(pasLng)) return null;
          // Firma correcta: buildPassengerMarkerIconSpec(createdAt, status)
          const spec = buildPassengerMarkerIconSpec(trip.created_at, trip.status);
          return (
            <Marker
              key={`trip-${trip.id}`}
              longitude={pasLng}
              latitude={pasLat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setActiveInfo({ type: 'trip', data: trip });
              }}
            >
              <img
                src={spec.url}
                width={spec.width}
                height={spec.height}
                alt="pasajero"
                style={{
                  cursor: 'pointer',
                  display: 'block',
                  filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.3))',
                }}
              />
            </Marker>
          );
        })}

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

      {activeInfo?.type === 'driver' ? (
        <>
          <button
            type="button"
            aria-label="Cerrar detalle del chofer"
            className="absolute inset-0 z-[15] border-0 bg-slate-900/25 p-0"
            onClick={() => setActiveInfo(null)}
          />
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
            <div
              className="pointer-events-auto w-full max-w-[min(320px,calc(100%-2rem))]"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Chofer ${activeInfo.data.fullName}`}
            >
              <DriverInfoWindow
                driver={activeInfo.data}
                onAssignTrip={(d) => { setActiveInfo(null); onAssignTrip?.(d); }}
                onClose={() => setActiveInfo(null)}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
});

export default MapView;
