import React from 'react';
import { Marker } from 'react-native-maps';

const DRIVER_LOCATION_ICON = require('../../../assets/driver-nav-puck.png');
const ICON_SIZE = 42;

/** Marcador de posición actual del chofer — imagen estática (sin recorte en Android). */
const DriverLocationMarker = React.memo(({ location }) => {
  if (!location?.lat || !location?.lng) return null;

  return (
    <Marker
      coordinate={{ latitude: location.lat, longitude: location.lng }}
      image={DRIVER_LOCATION_ICON}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      style={{ width: ICON_SIZE, height: ICON_SIZE }}
    />
  );
});

DriverLocationMarker.displayName = 'DriverLocationMarker';

export default DriverLocationMarker;
