'use client';

import React, { memo, useCallback, useMemo, useState } from 'react';
import Map, { Marker, Popup, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SALTA_CENTER, DEFAULT_ZOOM } from '../lib/constants';
import { MAP_STYLE_URL, DEFAULT_MAP_VIEW, mapLibreOptions } from '../lib/mapLibre';
import {
  buildDriverMarkerIconSpec,
  buildPassengerMarkerIconSpec,
} from '../lib/driverMarkerIcon';
import DriverInfoWindow from './DriverInfoWindow';
import PassengerInfoWindow from './PassengerInfoWindow';

const DriverMapMarker = memo(function DriverMapMarker({
  driver,
  isSelected,
  isMultiSelected,
  onClick,
}) {
  const icon = useMemo(() => {
    return buildDriverMarkerIconSpec(driver, isSelected, isMultiSelected);
  }, [
    driver.activeTrip,
    driver.isOnline,
    driver.driverNumber,
    isSelected,
    isMultiSelected,
  ]);

  if (!icon || !Number.isFinite(Number(driver.lat)) || !Number.isFinite(Number(driver.lng))) {
    return null;
  }

  return (
    <Marker
      longitude={Number(driver.lng)}
      latitude={Number(driver.lat)}
      anchor="bottom"
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        onClick(driver);
      }}
    >
      <img
        src={icon.url}
        alt={driver.fullName || 'Conductor'}
        width={icon.width}
        height={icon.height}
        style={{ display: 'block', cursor: 'pointer' }}
      />
    </Marker>
  );
}, (prev, next) => (
  prev.driver.id === next.driver.id
  && prev.driver.lat === next.driver.lat
  && prev.driver.lng === next.driver.lng
  && prev.driver.isOnline === next.driver.isOnline
  && prev.driver.activeTrip === next.driver.activeTrip
  && prev.driver.driverNumber === next.driver.driverNumber
  && prev.isSelected === next.isSelected
  && prev.isMultiSelected === next.isMultiSelected
));

const PassengerMapMarker = memo(function PassengerMapMarker({ trip, onClick }) {
  const icon = useMemo(() => {
    return buildPassengerMarkerIconSpec(trip.createdAt, trip.status);
  }, [trip.createdAt, trip.status]);

  if (!icon || !Number.isFinite(Number(trip.lat)) || !Number.isFinite(Number(trip.lng))) {
    return null;
  }

  return (
    <Marker
      longitude={Number(trip.lng)}
      latitude={Number(trip.lat)}
      anchor="center"
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        onClick(trip);
      }}
    >
      <img
        src={icon.url}
        alt={trip.passengerName || 'Pasajero'}
        width={icon.width}
        height={icon.height}
        style={{ display: 'block', cursor: 'pointer' }}
      />
    </Marker>
  );
}, (prev, next) => (
  prev.trip.id === next.trip.id
  && prev.trip.lat === next.trip.lat
  && prev.trip.lng === next.trip.lng
  && prev.trip.createdAt === next.trip.createdAt
  && prev.trip.status === next.trip.status
));

// Capa de línea para la ruta de preview
const ROUTE_LINE_LAYER = {
  id: 'preview-route-line',
  type: 'line',
  paint: {
    'line-color': '#DC2626',
    'line-width': 4.5,
    'line-opacity': 0.88,
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
};

const ROUTE_BORDER_LAYER = {
  id: 'preview-route-border',
  type: 'line',
  paint: {
    'line-color': '#7F1D1D',
    'line-width': 7,
    'line-opacity': 0.2,
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
};

function RoutePreviewLayer({ previewRoute }) {
  if (!previewRoute?.polylineCoords?.length) return null;

  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: previewRoute.polylineCoords.map((p) => [p.lng, p.lat]),
    },
  };

  return (
    <Source id="preview-route" type="geojson" data={geojson}>
      <Layer {...ROUTE_BORDER_LAYER} />
      <Layer {...ROUTE_LINE_LAYER} />
    </Source>
  );
}

function PreviewMarker({ lat, lng, type }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const isOrigin = type === 'origin';
  return (
    <Marker longitude={lng} latitude={lat} anchor="bottom">
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: isOrigin ? '50%' : 6,
          background: isOrigin ? '#DC2626' : '#059669',
          border: '3px solid #FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 800,
          color: '#FFFFFF',
        }}>
          {isOrigin ? 'A' : 'B'}
        </div>
        <div style={{ width: 2, height: 8, background: isOrigin ? '#DC2626' : '#059669' }} />
      </div>
    </Marker>
  );
}

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
  const [activeInfo, setActiveInfo] = useState(null);
  const [activePassenger, setActivePassenger] = useState(null);
  const [viewState, setViewState] = useState({
    ...DEFAULT_MAP_VIEW,
    longitude: SALTA_CENTER.lng,
    latitude: SALTA_CENTER.lat,
    zoom: DEFAULT_ZOOM,
  });

  const onLoad = useCallback((event) => {
    if (mapRef) mapRef.current = event.target;
  }, [mapRef]);

  const handleMarkerClick = useCallback((driver) => {
    if (multiSelectMode) {
      onToggleMultiSelect(driver.id);
      return;
    }
    setActiveInfo(driver);
    onSelectDriver(driver.id);
  }, [multiSelectMode, onToggleMultiSelect, onSelectDriver]);

  const handlePassengerClick = useCallback((trip) => {
    setActivePassenger(trip);
    setActiveInfo(null);
  }, []);

  const handleMapClick = useCallback(() => {
    setActiveInfo(null);
    setActivePassenger(null);
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full">
      <Map
        {...viewState}
        onMove={(event) => setViewState(event.viewState)}
        mapStyle={MAP_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        onLoad={onLoad}
        onClick={handleMapClick}
        {...mapLibreOptions}
      >
        {drivers.map((driver) => (
          <DriverMapMarker
            key={driver.id}
            driver={driver}
            isSelected={selectedId === driver.id}
            isMultiSelected={multiSelectMode && multiSelectedIds.has(driver.id)}
            onClick={handleMarkerClick}
          />
        ))}

        {pendingPassengers.map((trip) => (
          <PassengerMapMarker
            key={`passenger-${trip.id}`}
            trip={trip}
            onClick={handlePassengerClick}
          />
        ))}

        {/* ── Ruta de preview al asignar un viaje ──────────────────────── */}
        <RoutePreviewLayer previewRoute={previewRoute} />
        {previewRoute?.origin && (
          <PreviewMarker lat={previewRoute.origin.lat} lng={previewRoute.origin.lng} type="origin" />
        )}
        {previewRoute?.destination && (
          <PreviewMarker lat={previewRoute.destination.lat} lng={previewRoute.destination.lng} type="destination" />
        )}

        {activeInfo && !multiSelectMode ? (
          <Popup
            longitude={Number(activeInfo.lng)}
            latitude={Number(activeInfo.lat)}
            anchor="bottom"
            offset={24}
            closeOnClick={false}
            onClose={() => setActiveInfo(null)}
            className="driver-popup"
          >
            <DriverInfoWindow driver={activeInfo} onAssignTrip={onAssignTrip} />
          </Popup>
        ) : null}

        {activePassenger ? (
          <Popup
            longitude={Number(activePassenger.lng)}
            latitude={Number(activePassenger.lat)}
            anchor="bottom"
            offset={8}
            closeOnClick={false}
            onClose={() => setActivePassenger(null)}
            maxWidth="300px"
          >
            <PassengerInfoWindow trip={activePassenger} />
          </Popup>
        ) : null}
      </Map>
    </div>
  );
}

export default memo(MapView);
