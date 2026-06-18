'use client';

import React, { memo, useCallback, useMemo, useState } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
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
