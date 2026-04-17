import React, { useCallback, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, OverlayView } from '@react-google-maps/api';
import { SALTA_CENTER, DEFAULT_ZOOM, LIGHT_MAP_STYLE, CAR_ICON_SVG, MOTO_ICON_SVG } from '../lib/constants';
import DriverInfoWindow from './DriverInfoWindow';

const containerStyle = { width: '100%', height: '100%' };
const LIBRARIES = ['places'];

const mapOptions = {
  styles: LIGHT_MAP_STYLE,
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 9 },
  fullscreenControl: false,
  streetViewControl: false,
  mapTypeControl: false,
};

export default function MapView({ drivers, selectedId, onSelectDriver, mapRef, onAssignTrip, multiSelectMode, multiSelectedIds, onToggleMultiSelect }) {
  const [activeInfo, setActiveInfo] = useState(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, [mapRef]);

  const handleMarkerClick = (driver) => {
    if (multiSelectMode) {
      onToggleMultiSelect(driver.id);
      return;
    }
    setActiveInfo(driver);
    onSelectDriver(driver.id);
  };

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-light-200">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Cargando mapa...</span>
        </div>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={SALTA_CENTER}
      zoom={DEFAULT_ZOOM}
      options={mapOptions}
      onLoad={onLoad}
      onClick={() => setActiveInfo(null)}
    >
      {drivers.map((driver) => {
        const isSelected = selectedId === driver.id;
        const isMultiSelected = multiSelectMode && multiSelectedIds.has(driver.id);
        return (
          <React.Fragment key={driver.id}>
            <Marker
              position={{ lat: driver.lat, lng: driver.lng }}
              onClick={() => handleMarkerClick(driver)}
              icon={{
                path: driver.vehicleType === 'moto' ? MOTO_ICON_SVG : CAR_ICON_SVG,
                fillColor: isMultiSelected ? '#8B5CF6' : driver.activeTrip ? '#EF4444' : driver.isOnline ? '#22C55E' : '#94A3B8',
                fillOpacity: 1,
                strokeColor: isMultiSelected ? '#7C3AED' : driver.activeTrip ? '#B91C1C' : driver.isOnline ? '#16A34A' : '#64748B',
                strokeWeight: isMultiSelected ? 2.5 : 1.5,
                scale: isSelected || isMultiSelected ? 1.8 : 1.4,
                anchor: { x: 12, y: 12 },
                rotation: driver.heading || 0,
              }}
              title={driver.fullName}
            />
            {driver.driverNumber != null && (
              <OverlayView
                position={{ lat: driver.lat, lng: driver.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -h - (isSelected || isMultiSelected ? 20 : 14) })}
              >
              <div
                onClick={() => handleMarkerClick(driver)}
                style={{
                  background: isMultiSelected ? '#7C3AED' : driver.activeTrip ? '#B91C1C' : driver.isOnline ? '#22C55E' : '#64748B',
                  color: '#fff',
                  fontSize: '9px',
                  fontWeight: 700,
                  lineHeight: '16px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  textAlign: 'center',
                  boxShadow: isMultiSelected ? '0 0 0 3px rgba(139,92,246,0.4), 0 1px 4px rgba(0,0,0,0.5)' : '0 1px 4px rgba(0,0,0,0.5)',
                  border: '1.5px solid rgba(255,255,255,0.6)',
                  userSelect: 'none',
                  letterSpacing: '-0.5px',
                }}
              >
                {isMultiSelected ? '✓' : driver.driverNumber}
              </div>
            </OverlayView>
          )}
          </React.Fragment>
        );
      })}

      {activeInfo && !multiSelectMode && (
        <InfoWindow
          position={{ lat: activeInfo.lat, lng: activeInfo.lng }}
          onCloseClick={() => setActiveInfo(null)}
          options={{ pixelOffset: new window.google.maps.Size(0, -20) }}
        >
          <DriverInfoWindow driver={activeInfo} onAssignTrip={onAssignTrip} />
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
