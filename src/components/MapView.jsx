import { useCallback, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { SALTA_CENTER, DEFAULT_ZOOM, DARK_MAP_STYLE } from '../lib/constants';
import DriverInfoWindow from './DriverInfoWindow';

const containerStyle = { width: '100%', height: '100%' };

const mapOptions = {
  styles: DARK_MAP_STYLE,
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 9 }, // RIGHT_CENTER
  fullscreenControl: false,
  streetViewControl: false,
  mapTypeControl: false,
};

export default function MapView({ drivers, selectedId, onSelectDriver, mapRef }) {
  const [activeInfo, setActiveInfo] = useState(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, [mapRef]);

  const handleMarkerClick = (driver) => {
    setActiveInfo(driver);
    onSelectDriver(driver.id);
  };

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-900">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando mapa...
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
      {drivers.map((driver) => (
        <Marker
          key={driver.id}
          position={{ lat: driver.lat, lng: driver.lng }}
          onClick={() => handleMarkerClick(driver)}
          icon={{
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
            fillColor: driver.isOnline ? '#34D399' : '#6B7280',
            fillOpacity: 1,
            strokeColor: driver.isOnline ? '#059669' : '#4B5563',
            strokeWeight: 2,
            scale: selectedId === driver.id ? 2 : 1.5,
            anchor: { x: 12, y: 22 },
          }}
          title={driver.fullName}
        />
      ))}

      {activeInfo && (
        <InfoWindow
          position={{ lat: activeInfo.lat, lng: activeInfo.lng }}
          onCloseClick={() => setActiveInfo(null)}
          options={{ pixelOffset: new window.google.maps.Size(0, -30) }}
        >
          <DriverInfoWindow driver={activeInfo} />
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
