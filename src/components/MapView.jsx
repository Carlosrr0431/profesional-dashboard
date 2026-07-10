'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
import { SALTA_CENTER, DEFAULT_ZOOM } from '../lib/constants';
import {
  buildDriverMarkerIconSpec,
  buildPassengerMarkerIconSpec,
  toGoogleMarkerIcon,
} from '../lib/driverMarkerIcon';
import { useGoogleMapsLoader } from '../lib/googleMaps';
import DriverInfoWindow from './DriverInfoWindow';
import PassengerInfoWindow from './PassengerInfoWindow';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 1 }, // TOP_LEFT when loaded
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
  // Mapa estándar de Google (mismo look que maps.google.com)
  mapTypeId: 'roadmap',
};

function wrapMapApi(map) {
  if (!map || !window.google?.maps) return null;
  return {
    flyTo: ({ center, zoom }) => {
      const [lng, lat] = center;
      map.panTo({ lat, lng });
      if (zoom != null) map.setZoom(zoom);
    },
    fitBounds: (bounds, opts = {}) => {
      // bounds: [[swLng, swLat], [neLng, neLat]]
      const [[swLng, swLat], [neLng, neLat]] = bounds;
      const gBounds = new window.google.maps.LatLngBounds(
        { lat: swLat, lng: swLng },
        { lat: neLat, lng: neLng },
      );
      const padding = typeof opts.padding === 'number' ? opts.padding : 64;
      map.fitBounds(gBounds, padding);
    },
    getMap: () => map,
  };
}

const DriverMapPin = memo(function DriverMapPin({ driver, isSelected, onSelect }) {
  const spec = buildDriverMarkerIconSpec(driver, isSelected, false);
  const icon = toGoogleMarkerIcon(spec);
  return (
    <Marker
      position={{ lat: Number(driver.lat), lng: Number(driver.lng) }}
      icon={icon}
      zIndex={isSelected ? 20 : 10}
      onClick={() => onSelect(driver)}
      title={driver.full_name ?? driver.fullName ?? 'Chofer'}
    />
  );
});

const MapView = memo(function MapView({
  mapRef,
  drivers = [],
  trips = [],
  selectedDriverId,
  onDriverClick,
  onAssignTrip,
  previewRoute,
}) {
  const { isLoaded, loadError } = useGoogleMapsLoader();
  const [activeInfo, setActiveInfo] = useState(null);
  const googleMapRef = useRef(null);

  useEffect(() => {
    if (activeInfo?.type !== 'driver') return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setActiveInfo(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeInfo?.type]);

  const exposeMapApi = useCallback((map) => {
    googleMapRef.current = map;
    if (!mapRef) return;
    mapRef.current = wrapMapApi(map);
  }, [mapRef]);

  useEffect(() => {
    if (!mapRef) return undefined;
    return () => {
      mapRef.current = null;
    };
  }, [mapRef]);

  const handleMapClick = useCallback(() => {
    setActiveInfo(null);
  }, []);

  const handleDriverSelect = useCallback((driver) => {
    setActiveInfo({ type: 'driver', data: driver });
    onDriverClick?.(driver);
  }, [onDriverClick]);

  const routePath = useMemo(() => {
    if (!previewRoute?.polylineCoords?.length) return null;
    return previewRoute.polylineCoords.map((p) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
    }));
  }, [previewRoute]);

  useEffect(() => {
    const api = wrapMapApi(googleMapRef.current);
    if (!previewRoute || !api) return;

    if (previewRoute?.polylineCoords?.length > 1) {
      const coords = previewRoute.polylineCoords;
      const lngs = coords.map((p) => Number(p.lng));
      const lats = coords.map((p) => Number(p.lat));
      api.fitBounds(
        [
          [Math.min(...lngs) - 0.002, Math.min(...lats) - 0.002],
          [Math.max(...lngs) + 0.002, Math.max(...lats) + 0.002],
        ],
        { padding: 72 },
      );
      return;
    }

    const lat = Number(previewRoute?.origin?.lat);
    const lng = Number(previewRoute?.origin?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      api.flyTo({ center: [lng, lat], zoom: 16 });
    }
  }, [previewRoute]);

  const mapOptions = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return MAP_OPTIONS;
    return {
      ...MAP_OPTIONS,
      zoomControlOptions: {
        position: window.google.maps.ControlPosition.LEFT_TOP,
      },
    };
  }, [isLoaded]);

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 px-6 text-center text-sm text-slate-600">
        No se pudo cargar Google Maps. Verificá NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en Vercel.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        Cargando mapa…
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={SALTA_CENTER}
        zoom={DEFAULT_ZOOM}
        options={mapOptions}
        onLoad={exposeMapApi}
        onClick={handleMapClick}
      >
        {routePath ? (
          <>
            <Polyline
              path={routePath}
              options={{
                strokeColor: '#FFFFFF',
                strokeOpacity: 0.95,
                strokeWeight: 10,
                zIndex: 1,
              }}
            />
            <Polyline
              path={routePath}
              options={{
                strokeColor: '#DC2626',
                strokeOpacity: 0.92,
                strokeWeight: 5,
                zIndex: 2,
              }}
            />
          </>
        ) : null}

        {previewRoute?.origin?.lat && previewRoute?.origin?.lng ? (
          <Marker
            position={{
              lat: Number(previewRoute.origin.lat),
              lng: Number(previewRoute.origin.lng),
            }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: '#DC2626',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 3,
            }}
            zIndex={5}
          />
        ) : null}

        {previewRoute?.destination?.lat && previewRoute?.destination?.lng ? (
          <Marker
            position={{
              lat: Number(previewRoute.destination.lat),
              lng: Number(previewRoute.destination.lng),
            }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: '#1D4ED8',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 3,
            }}
            zIndex={5}
          />
        ) : null}

        {drivers.map((driver) => {
          if (!driver.lat || !driver.lng) return null;
          return (
            <DriverMapPin
              key={driver.id}
              driver={driver}
              isSelected={driver.id === selectedDriverId}
              onSelect={handleDriverSelect}
            />
          );
        })}

        {trips.map((trip) => {
          const pasLat = Number(trip.passenger_lat ?? trip.pickup_lat);
          const pasLng = Number(trip.passenger_lng ?? trip.pickup_lng);
          if (!Number.isFinite(pasLat) || !Number.isFinite(pasLng)) return null;
          const spec = buildPassengerMarkerIconSpec(trip.created_at, trip.status);
          return (
            <Marker
              key={`trip-${trip.id}`}
              position={{ lat: pasLat, lng: pasLng }}
              icon={toGoogleMarkerIcon(spec)}
              zIndex={8}
              onClick={() => setActiveInfo({ type: 'trip', data: trip })}
            />
          );
        })}

        {activeInfo?.type === 'trip' ? (
          <InfoWindow
            position={{
              lat: Number(activeInfo.data.passenger_lat ?? activeInfo.data.pickup_lat),
              lng: Number(activeInfo.data.passenger_lng ?? activeInfo.data.pickup_lng),
            }}
            onCloseClick={() => setActiveInfo(null)}
          >
            <PassengerInfoWindow
              trip={activeInfo.data}
              onClose={() => setActiveInfo(null)}
            />
          </InfoWindow>
        ) : null}
      </GoogleMap>

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
