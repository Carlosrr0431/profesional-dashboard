'use client';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  ZoomControl,
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
import { shouldShowDriverOnMap } from '../lib/driverPresence';
import { useSmoothMapCoords } from '../hooks/useSmoothMapCoords';
import { extractMapClickLngLat } from '../lib/mapPointPick';

const MAP_CSS = `
.leaflet-container {
  position: relative;
  z-index: 0;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  outline: none;
  background: #e8e6e1;
}
.leaflet-container img.leaflet-tile {
  mix-blend-mode: normal !important;
  box-sizing: content-box;
}
.leaflet-control-zoom a { width: 28px; height: 28px; line-height: 28px; }
.leaflet-control-attribution { font-size: 10px; background: rgba(255,255,255,0.72); }
.fleet-map-pin { background: transparent; border: none; }
.map-pick-arrow, .map-pick-arrow .leaflet-container { cursor: default !important; }
`;

const GOOGLE_TILES = {
  // lyrs=m es el mapa de calles. apistyle apaga puntos de interés (plazas, parques,
  // comercios) e íconos de transporte para que no compitan con los pines de choferes.
  url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&apistyle=s.t:2|p.v:off,s.t:4|s.e:l.i|p.v:off',
  subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  maxZoom: 20,
  attribution: '&copy; Google Maps',
};

function pinIcon(spec, emphasized) {
  const scale = emphasized ? 'transform:scale(1.08);' : '';
  return L.divIcon({
    className: 'fleet-map-pin',
    html: `<img src="${spec.url}" width="${spec.width}" height="${spec.height}" alt="" draggable="false" style="display:block;${scale}transition:transform .12s ease-out" />`,
    iconSize: [spec.width, spec.height],
    iconAnchor: [spec.anchorX, spec.anchorY],
  });
}

function msToSeconds(duration) {
  const value = Number(duration);
  if (!Number.isFinite(value) || value <= 0) return 0.6;
  return value > 20 ? value / 1000 : value;
}

const DriverMapPin = memo(function DriverMapPin({
  driver,
  lat,
  lng,
  speed,
  heading,
  isSelected,
  isMultiSelected,
  interactive = true,
  onSelect,
}) {
  const smooth = useSmoothMapCoords(lat, lng, speed, heading);
  const spec = buildDriverMarkerIconSpec(driver, isSelected, isMultiSelected);
  const icon = useMemo(
    () => pinIcon(spec, isSelected || isMultiSelected),
    [spec.url, spec.width, spec.height, spec.anchorX, spec.anchorY, isSelected, isMultiSelected],
  );
  return (
    <Marker
      position={[smooth.lat, smooth.lng]}
      icon={icon}
      interactive={interactive}
      zIndexOffset={isSelected || isMultiSelected ? 1000 : 700}
      eventHandlers={{
        click: (event) => {
          if (!interactive) return;
          L.DomEvent.stopPropagation(event);
          onSelect(driver);
        },
      }}
    />
  );
}, (prev, next) => (
  prev.lat === next.lat
  && prev.lng === next.lng
  && prev.speed === next.speed
  && prev.heading === next.heading
  && prev.isSelected === next.isSelected
  && prev.isMultiSelected === next.isMultiSelected
  && prev.interactive === next.interactive
  && prev.driver?.id === next.driver?.id
  && prev.driver?.driverNumber === next.driver?.driverNumber
  && prev.driver?.isOnline === next.driver?.isOnline
  && prev.driver?.isAvailable === next.driver?.isAvailable
  && (prev.driver?.activeTrip?.id || null) === (next.driver?.activeTrip?.id || null)
  && (prev.driver?.activeTrip?.status || null) === (next.driver?.activeTrip?.status || null)
  && prev.onSelect === next.onSelect
));

function MapBridge({
  mapRef,
  mapFullscreen,
  previewRoute,
  pickMode,
  onPickLocation,
  multiSelectMode,
  onBackgroundClick,
}) {
  const map = useMap();

  useEffect(() => {
    const api = {
      flyTo(opts = {}) {
        const [lng, lat] = opts.center || [];
        if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
        map.flyTo([Number(lat), Number(lng)], opts.zoom, { duration: msToSeconds(opts.duration) });
      },
      fitBounds(bounds, opts = {}) {
        const [[swLng, swLat], [neLng, neLat]] = bounds;
        const pad = Number(opts.padding) || 0;
        map.fitBounds(
          [[swLat, swLng], [neLat, neLng]],
          { padding: [pad, pad], duration: msToSeconds(opts.duration) },
        );
      },
      getMap: () => map,
    };
    if (mapRef) mapRef.current = api;
    return () => {
      if (mapRef && mapRef.current === api) mapRef.current = null;
    };
  }, [map, mapRef]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    const timeoutId = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeoutId);
    };
  }, [map, mapFullscreen]);

  useEffect(() => {
    if (!previewRoute) return;
    const coords = previewRoute.polylineCoords;
    if (coords?.length > 1) {
      const lngs = coords.map((point) => Number(point.lng));
      const lats = coords.map((point) => Number(point.lat));
      map.fitBounds(
        [
          [Math.min(...lats) - 0.002, Math.min(...lngs) - 0.002],
          [Math.max(...lats) + 0.002, Math.max(...lngs) + 0.002],
        ],
        { padding: [72, 72], duration: 0.9 },
      );
      return;
    }
    const lat = Number(previewRoute.origin?.lat);
    const lng = Number(previewRoute.origin?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], 16, { duration: 0.9 });
      return;
    }
    const destLat = Number(previewRoute.destination?.lat);
    const destLng = Number(previewRoute.destination?.lng);
    if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
      map.flyTo([destLat, destLng], 16, { duration: 0.9 });
    }
  }, [map, previewRoute]);

  useMapEvents({
    click(event) {
      if (pickMode && onPickLocation) {
        const target = event.originalEvent?.target;
        if (target?.closest?.('.leaflet-control')) return;
        const point = extractMapClickLngLat(event);
        if (point) onPickLocation(point);
        return;
      }
      if (!multiSelectMode) onBackgroundClick?.();
    },
  });

  return null;
}

function FullscreenButton({ isFullscreen, onToggle }) {
  const label = isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onToggle}
      className="absolute right-[10px] top-[78px] z-[500] flex h-7 w-7 items-center justify-center rounded-sm border-0 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
    >
      {isFullscreen ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )}
    </button>
  );
}

const MapView = memo(function MapView({
  mapRef,
  drivers = [],
  trips = [],
  pendingPassengers = [],
  selectedId = null,
  selectedDriverId = null,
  onSelectDriver,
  onDriverClick,
  onAssignTrip,
  previewRoute,
  multiSelectMode = false,
  multiSelectedIds = null,
  onToggleMultiSelect,
  onSendAudio,
  mapFullscreen = false,
  onToggleMapFullscreen,
  pickMode = null,
  onPickLocation,
}) {
  const [activeInfo, setActiveInfo] = useState(null);
  const resolvedSelectedId = selectedId ?? selectedDriverId ?? null;
  const tripList = trips?.length ? trips : pendingPassengers;
  const selectedSet = multiSelectedIds instanceof Set
    ? multiSelectedIds
    : new Set(Array.isArray(multiSelectedIds) ? multiSelectedIds : []);
  const routePositions = previewRoute?.polylineCoords?.length
    ? previewRoute.polylineCoords.map((point) => [Number(point.lat), Number(point.lng)])
    : null;

  useEffect(() => {
    if (activeInfo?.type !== 'driver' && activeInfo?.type !== 'trip') return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setActiveInfo(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeInfo?.type]);

  useEffect(() => {
    if (multiSelectMode) setActiveInfo(null);
  }, [multiSelectMode]);

  useEffect(() => {
    if (pickMode) setActiveInfo(null);
  }, [pickMode]);

  const handleDriverSelect = useCallback((driver) => {
    if (pickMode) return;
    if (multiSelectMode) {
      onToggleMultiSelect?.(driver.id);
      return;
    }
    setActiveInfo({ type: 'driver', data: driver });
    onSelectDriver?.(driver.id);
    onDriverClick?.(driver);
  }, [pickMode, multiSelectMode, onToggleMultiSelect, onSelectDriver, onDriverClick]);

  return (
    <div
      className={pickMode ? 'map-pick-arrow' : undefined}
      style={{ width: '100%', height: '100%', position: 'relative', cursor: pickMode ? 'default' : undefined }}
    >
      <style>{MAP_CSS}</style>
      <MapContainer
        center={[SALTA_CENTER.lat, SALTA_CENTER.lng]}
        zoom={DEFAULT_ZOOM}
        maxZoom={GOOGLE_TILES.maxZoom}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url={GOOGLE_TILES.url}
          subdomains={GOOGLE_TILES.subdomains}
          maxZoom={GOOGLE_TILES.maxZoom}
          attribution={GOOGLE_TILES.attribution}
          crossOrigin
        />
        <ZoomControl position="topright" />
        <MapBridge
          mapRef={mapRef}
          mapFullscreen={mapFullscreen}
          previewRoute={previewRoute}
          pickMode={pickMode}
          onPickLocation={onPickLocation}
          multiSelectMode={multiSelectMode}
          onBackgroundClick={() => setActiveInfo(null)}
        />

        {routePositions ? (
          <>
            <Polyline positions={routePositions} pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.9 }} />
            <Polyline positions={routePositions} pathOptions={{ color: '#DC2626', weight: 5, opacity: 0.92 }} />
          </>
        ) : null}
        {Number.isFinite(Number(previewRoute?.origin?.lat)) && Number.isFinite(Number(previewRoute?.origin?.lng)) ? (
          <CircleMarker
            center={[Number(previewRoute.origin.lat), Number(previewRoute.origin.lng)]}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#DC2626', fillOpacity: 1 }}
          />
        ) : null}
        {Number.isFinite(Number(previewRoute?.destination?.lat)) && Number.isFinite(Number(previewRoute?.destination?.lng)) ? (
          <CircleMarker
            center={[Number(previewRoute.destination.lat), Number(previewRoute.destination.lng)]}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#059669', fillOpacity: 1 }}
          />
        ) : null}

        {drivers.map((driver) => {
          const lat = Number(driver.lat);
          const lng = Number(driver.lng);
          if (!shouldShowDriverOnMap({ ...driver, lat, lng })) return null;
          return (
            <DriverMapPin
              key={driver.id}
              driver={driver}
              lat={lat}
              lng={lng}
              speed={Number(driver.speed) || 0}
              heading={Number(driver.heading) || 0}
              isSelected={!multiSelectMode && driver.id === resolvedSelectedId}
              isMultiSelected={multiSelectMode && selectedSet.has(driver.id)}
              interactive={!pickMode}
              onSelect={handleDriverSelect}
            />
          );
        })}

        {tripList.map((trip) => {
          const pasLat = Number(trip.passenger_lat ?? trip.pickup_lat ?? trip.origin_lat ?? trip.lat);
          const pasLng = Number(trip.passenger_lng ?? trip.pickup_lng ?? trip.origin_lng ?? trip.lng);
          if (!Number.isFinite(pasLat) || !Number.isFinite(pasLng)) return null;
          const spec = buildPassengerMarkerIconSpec(trip.created_at ?? trip.createdAt, trip.status);
          return (
            <Marker
              key={`trip-${trip.id}`}
              position={[pasLat, pasLng]}
              icon={pinIcon(spec, false)}
              interactive={!pickMode && !multiSelectMode}
              eventHandlers={{
                click: (event) => {
                  if (pickMode || multiSelectMode) return;
                  L.DomEvent.stopPropagation(event);
                  setActiveInfo({ type: 'trip', data: trip });
                },
              }}
            />
          );
        })}
      </MapContainer>

      {onToggleMapFullscreen ? (
        <FullscreenButton isFullscreen={mapFullscreen} onToggle={onToggleMapFullscreen} />
      ) : null}

      {activeInfo?.type === 'trip' && !multiSelectMode ? (
        <>
          <button
            type="button"
            aria-label="Cerrar detalle del pasajero"
            className="absolute inset-0 z-[15] border-0 bg-slate-900/25 p-0"
            onClick={() => setActiveInfo(null)}
          />
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
            <div
              className="pointer-events-auto w-full max-w-[min(440px,calc(100%-2rem))] overflow-hidden"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Pasajero ${activeInfo.data.passengerName || ''}`}
            >
              <PassengerInfoWindow
                trip={activeInfo.data}
                drivers={drivers}
                onClose={() => setActiveInfo(null)}
                onAssigned={() => setActiveInfo(null)}
              />
            </div>
          </div>
        </>
      ) : null}

      {activeInfo?.type === 'driver' && !multiSelectMode ? (
        <>
          <button
            type="button"
            aria-label="Cerrar detalle del chofer"
            className="absolute inset-0 z-[15] border-0 bg-slate-900/25 p-0"
            onClick={() => setActiveInfo(null)}
          />
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
            <div
              className="pointer-events-auto w-full max-w-[min(440px,calc(100%-2rem))] overflow-hidden"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Chofer ${activeInfo.data.fullName}`}
            >
              <DriverInfoWindow
                driver={activeInfo.data}
                onAssignTrip={(driver) => { onAssignTrip?.(driver); }}
                onSendAudio={onSendAudio ? (driver) => {
                  setActiveInfo(null);
                  onSendAudio(driver);
                } : undefined}
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
