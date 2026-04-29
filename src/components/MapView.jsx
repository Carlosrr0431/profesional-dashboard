import React, { useCallback, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, OverlayView } from '@react-google-maps/api';
import { SALTA_CENTER, DEFAULT_ZOOM, LIGHT_MAP_STYLE, CAR_ICON_SVG, MOTO_ICON_SVG } from '../lib/constants';
import DriverInfoWindow from './DriverInfoWindow';

// SVG de pin de pasajero en espera (color naranja)
const PASSENGER_PIN_SVG = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

function timeAgoShort(isoDate) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const containerStyle = { width: '100%', height: '100%' };
const LIBRARIES = ['places', 'drawing'];
const FIXED_MARKER_ROTATION = 0;
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

const mapOptions = {
  styles: LIGHT_MAP_STYLE,
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 9 },
  fullscreenControl: false,
  streetViewControl: false,
  mapTypeControl: false,
};

export default function MapView({ drivers, pendingPassengers = [], selectedId, onSelectDriver, mapRef, onAssignTrip, multiSelectMode, multiSelectedIds, onToggleMultiSelect }) {
  const [activeInfo, setActiveInfo] = useState(null);
  const [activePassenger, setActivePassenger] = useState(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div className="flex-1 flex items-center justify-center bg-light-200">
        <div className="flex flex-col items-center gap-2 text-gray-500 px-6 text-center">
          <p className="text-sm font-semibold">Falta configurar Google Maps</p>
          <p className="text-xs">Defini NEXT_PUBLIC_GOOGLE_MAPS_API_KEY o GOOGLE_MAPS_API_KEY.</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-light-200">
        <div className="flex flex-col items-center gap-2 text-red-500 px-6 text-center">
          <p className="text-sm font-semibold">No se pudo cargar Google Maps</p>
          <p className="text-xs">Revisá restricciones de la API Key en Google Cloud y el dominio de Vercel.</p>
        </div>
      </div>
    );
  }

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
      onClick={() => { setActiveInfo(null); setActivePassenger(null); }}
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
                rotation: FIXED_MARKER_ROTATION,
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

      {/* Marcadores de pasajeros en espera */}
      {pendingPassengers.map((trip) => (
        <React.Fragment key={`passenger-${trip.id}`}>
          <Marker
            position={{ lat: trip.lat, lng: trip.lng }}
            onClick={() => {
              setActivePassenger(trip);
              setActiveInfo(null);
            }}
            icon={{
              path: PASSENGER_PIN_SVG,
              fillColor: '#F97316',
              fillOpacity: 1,
              strokeColor: '#C2410C',
              strokeWeight: 1.5,
              scale: 1.6,
              anchor: { x: 12, y: 22 },
            }}
            title={trip.passengerName}
          />
          <OverlayView
            position={{ lat: trip.lat, lng: trip.lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -h - 30 })}
          >
            <div
              onClick={() => {
                setActivePassenger(trip);
                setActiveInfo(null);
              }}
              style={{
                background: '#F97316',
                color: '#fff',
                fontSize: '9px',
                fontWeight: 700,
                lineHeight: '14px',
                padding: '1px 5px',
                borderRadius: '999px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
                border: '1.5px solid rgba(255,255,255,0.7)',
                userSelect: 'none',
              }}
            >
              {timeAgoShort(trip.createdAt)}
            </div>
          </OverlayView>
        </React.Fragment>
      ))}

      {activePassenger && (
        <InfoWindow
          position={{ lat: activePassenger.lat, lng: activePassenger.lng }}
          onCloseClick={() => setActivePassenger(null)}
          options={{ pixelOffset: new window.google.maps.Size(0, -28) }}
        >
          <div style={{ minWidth: 200, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ background: '#F97316', borderRadius: '50%', width: 8, height: 8, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{activePassenger.passengerName}</span>
            </div>
            {activePassenger.passengerPhone && (
              <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px 0' }}>📞 {activePassenger.passengerPhone}</p>
            )}
            <p style={{ fontSize: 11, color: '#374151', margin: '0 0 4px 0', lineHeight: '1.4' }}>📍 {activePassenger.address}</p>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>Espera: {timeAgoShort(activePassenger.createdAt)}</p>
            {activePassenger.notes && (
              <p style={{ fontSize: 10, color: '#6b7280', margin: '4px 0 0 0', fontStyle: 'italic' }}>"{activePassenger.notes}"</p>
            )}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
