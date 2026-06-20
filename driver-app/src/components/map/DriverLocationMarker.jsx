import React from 'react';
import { Image, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';

const ICON_SIZE = 42;

/** Marcador de posición actual del chofer para MapLibre Native. */
const DriverLocationMarker = React.memo(({ location }) => {
  if (!location?.lat || !location?.lng) return null;

  return (
    <MapLibreGL.MarkerView
      id="driver-location-marker"
      coordinate={[Number(location.lng), Number(location.lat)]}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={{ width: ICON_SIZE, height: ICON_SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={require('../../../assets/driver-nav-puck.png')}
          style={{ width: ICON_SIZE, height: ICON_SIZE }}
          resizeMode="contain"
        />
      </View>
    </MapLibreGL.MarkerView>
  );
});

DriverLocationMarker.displayName = 'DriverLocationMarker';

export default DriverLocationMarker;
