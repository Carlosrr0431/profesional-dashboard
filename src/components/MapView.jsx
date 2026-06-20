'use client';

import React, { memo, useCallback, useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SALTA_CENTER, DEFAULT_ZOOM } from '../lib/constants';
import {
  buildDriverMarkerIconSpec,
  buildPassengerMarkerIconSpec,
} from '../lib/driverMarkerIcon';
import DriverInfoWindow from './DriverInfoWindow';
import PassengerInfoWindow from './PassengerInfoWindow';

// CartoDB Voyager — estética idéntica a Google Maps (gratuito, sin clave)
const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Estilos CSS globales para popups Leaflet modernos
const POPUP_GLOBAL_CSS = `
.leaflet-map-pane { cursor: default !important; }
.app-leaflet-popup .leaflet-popup-content-wrapper {
  border-radius: 16px !important;
  padding: 0 !important;
  overflow: hidden !important;
  box-shadow: 0 8px 32px rgba(15,23,42,0.22), 0 2px 8px rgba(15,23,42,0.12) !important;
  border: 1px solid rgba(226,232,240,0.85) !important;
  background: #ffffff !important;
}
.app-leaflet-popup .leaflet-popup-content {
  margin: 0 !important;
  width: auto !important;
  min-width: 0 !important;
}
.app-leaflet-popup .leaflet-popup-tip-container { display: none !important; }
.app-leaflet-popup .leaflet-popup-close-button { display: none !important; }
/* Botones de zoom al estilo Google Maps */
.leaflet-control-zoom {
  border: none !important;
  box-shadow: 0 2px 8px rgba(15,23,42,0.18) !important;
  border-radius: 10px !important;
  overflow: hidden !important;
}
.leaflet-control-zoom a {
  background: #fff !important;
  color: #444 !important;
  font-size: 18px !important;
  font-weight: 300 !important;
  line-height: 32px !important;
  width: 34px !important;
  height: 34px !important;
  border: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-decoration: none !important;
}
.leaflet-control-zoom a:hover { background: #f0f0f0 !important; }
.leaflet-control-zoom-in { border-bottom: 1px solid #e8e8e8 !important; }
`;

// Convierte el spec de icono SVG al formato Leaflet
function specToLeafletIcon(spec) {
  if (!spec) return null;
  return L.icon({
    iconUrl: spec.url,
    iconSize: [spec.width, spec.height],
    iconAnchor: [spec.anchorX, spec.anchorY],
    popupAnchor: [0, -spec.anchorY + 4],
    className: '',
  });
}

// Ajusta el mapa a la ruta cuando previewRoute cambia
function RouteFitBounds({ previewRoute }) {
  const map = useMap();
  useEffect(() => {
    const coords = previewRoute?.polylineCoords;
    if (!coords || coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [64, 64], maxZoom: 15, animate: true });
  }, [previewRoute, map]);
  return null;
}

// Cierra popups al hacer clic en el mapa (fuera de un marker)
function MapClickCloser() {
  const map = useMap();
  useMapEvents({
    click() {
      map.closePopup();
    },
  });
  return null;
}

// Wrapper que usa useMap para cerrar el popup al asignar viaje
function DriverPopupContent({ driver, onAssignTrip }) {
  const map = useMap();
  const handleAssign = useCallback(
    (d) => {
      map.closePopup();
      onAssignTrip?.(d);
    },
    [map, onAssignTrip],
  );
  return <DriverInfoWindow driver={driver} onAssignTrip={handleAssign} />;
}

// Marker individual de chofer
const DriverMapMarker = memo(function DriverMapMarker({
  driver,
  isSelected,
  isMultiSelected,
  multiSelectMode,
  onClick,
  onAssignTrip,
}) {
  const icon = useMemo(() => {
    const spec = buildDriverMarkerIconSpec(driver, isSelected, isMultiSelected);
    return specToLeafletIcon(spec);
  }, [
    driver.id,
    driver.isOnline,
    driver.activeTrip,
    driver.driverNumber,
    isSelected,
    isMultiSelected,
  ]);

  if (!icon || !Number.isFinite(Number(driver.lat)) || !Number.isFinite(Number(driver.lng))) {
    return null;
  }

  return (
    <Marker
      position={[Number(driver.lat), Number(driver.lng)]}
      icon={icon}
      zIndexOffset={isSelected || isMultiSelected ? 1000 : 0}
      eventHandlers={{
        click(e) {
          e.originalEvent?.stopPropagation();
          onClick(driver);
        },
      }}
    >
      {!multiSelectMode && (
        <Popup
          maxWidth={290}
          minWidth={250}
          closeButton={false}
          autoPan
          className="app-leaflet-popup"
        >
          <DriverPopupContent driver={driver} onAssignTrip={onAssignTrip} />
        </Popup>
      )}
    </Marker>
  );
});

// Marker individual de pasajero
const PassengerMapMarker = memo(function PassengerMapMarker({ trip }) {
  const icon = useMemo(() => {
    const spec = buildPassengerMarkerIconSpec(trip.createdAt, trip.status);
    return specToLeafletIcon(spec);
  }, [trip.id, trip.createdAt, trip.status]);

  if (!icon || !Number.isFinite(Number(trip.lat)) || !Number.isFinite(Number(trip.lng))) {
    return null;
  }

  return (
    <Marker
      position={[Number(trip.lat), Number(trip.lng)]}
      icon={icon}
      zIndexOffset={500}
    >
      <Popup
        maxWidth={290}
        minWidth={248}
        closeButton={false}
        autoPan
        className="app-leaflet-popup"
      >
        <PassengerInfoWindow trip={trip} />
      </Popup>
    </Marker>
  );
});

// Marker A / B para la vista previa de ruta
function RouteEndpointMarker({ lat, lng, type }) {
  const isOrigin = type === 'origin';
  const color = isOrigin ? '#DC2626' : '#059669';
  const label = isOrigin ? 'A' : 'B';
  const radius = isOrigin ? '50%' : '5px';

  const icon = useMemo(
    () =>
      L.divIcon({
        html: `<div style="
          width:28px;height:28px;
          border-radius:${radius};
          background:${color};
          border:3px solid #fff;
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:800;color:#fff;
          box-shadow:0 3px 10px rgba(0,0,0,0.35);
          font-family:Inter,system-ui,sans-serif;
        ">${label}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        className: '',
      }),
    [],
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return <Marker position={[lat, lng]} icon={icon} zIndexOffset={2000} />;
}

// Componente principal
function MapView({
  drivers,
  pendingPassengers = [],
  selectedId,
  onSelectDriver,
  mapRef,
  onAssignTrip,
  multiSelectMode,
  multiSelectedIds,
  onToggleMultiSelect,
  previewRoute = null,
}) {
  const handleDriverClick = useCallback(
    (driver) => {
      if (multiSelectMode) {
        onToggleMultiSelect(driver.id);
        return;
      }
      onSelectDriver(driver.id);
    },
    [multiSelectMode, onToggleMultiSelect, onSelectDriver],
  );

  const routeCoords = useMemo(() => {
    if (!previewRoute?.polylineCoords?.length) return null;
    return previewRoute.polylineCoords.map((p) => [p.lat, p.lng]);
  }, [previewRoute]);

  return (
    <div className="absolute inset-0 w-full h-full">
      {/* Estilos globales para popups y controles Leaflet */}
      <style>{POPUP_GLOBAL_CSS}</style>

      <MapContainer
        ref={mapRef}
        center={[SALTA_CENTER.lat, SALTA_CENTER.lng]}
        zoom={DEFAULT_ZOOM}
        style={{ width: '100%', height: '100%' }}
        zoomControl
        attributionControl={false}
        maxZoom={20}
      >
        {/* Capa base CartoDB Voyager — similar a Google Maps */}
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          subdomains="abcd"
          maxZoom={20}
          detectRetina
        />

        <MapClickCloser />
        <RouteFitBounds previewRoute={previewRoute} />

        {/* Markers de choferes */}
        {drivers.map((driver) => (
          <DriverMapMarker
            key={driver.id}
            driver={driver}
            isSelected={selectedId === driver.id}
            isMultiSelected={multiSelectMode && multiSelectedIds.has(driver.id)}
            multiSelectMode={multiSelectMode}
            onClick={handleDriverClick}
            onAssignTrip={onAssignTrip}
          />
        ))}

        {/* Markers de pasajeros */}
        {pendingPassengers.map((trip) => (
          <PassengerMapMarker key={`pax-${trip.id}`} trip={trip} />
        ))}

        {/* Polilínea de ruta (sombra + trazo principal) */}
        {routeCoords && routeCoords.length > 1 && (
          <>
            <Polyline
              positions={routeCoords}
              pathOptions={{
                color: '#7F1D1D',
                weight: 10,
                opacity: 0.15,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <Polyline
              positions={routeCoords}
              pathOptions={{
                color: '#DC2626',
                weight: 5,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* Markers A / B de origen y destino */}
        {previewRoute?.origin && (
          <RouteEndpointMarker
            lat={previewRoute.origin.lat}
            lng={previewRoute.origin.lng}
            type="origin"
          />
        )}
        {previewRoute?.destination && (
          <RouteEndpointMarker
            lat={previewRoute.destination.lat}
            lng={previewRoute.destination.lng}
            type="destination"
          />
        )}
      </MapContainer>

      {/* Atribución discreta */}
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          right: 6,
          zIndex: 1000,
          fontSize: 10,
          color: '#94A3B8',
          background: 'rgba(255,255,255,0.85)',
          padding: '2px 7px',
          borderRadius: 6,
          pointerEvents: 'auto',
          backdropFilter: 'blur(4px)',
        }}
      >
        {'© '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#64748B' }}
        >
          OpenStreetMap
        </a>
        {' © '}
        <a
          href="https://carto.com/attributions"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#64748B' }}
        >
          CARTO
        </a>
      </div>
    </div>
  );
}

export default memo(MapView);
