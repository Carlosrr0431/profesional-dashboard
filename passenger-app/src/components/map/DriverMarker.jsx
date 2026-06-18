import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { toLngLat } from '../../utils/mapLibreHelpers';

/**
 * Marcador del conductor sobre MapLibre (silueta de auto con orientación).
 */
const DriverMarker = React.memo(({ coordinate, heading = 0 }) => {
  const lngLat = toLngLat(coordinate);
  if (!lngLat) return null;

  const rotation = Number.isFinite(heading) ? heading : 0;

  return (
    <Marker id="passenger-driver" lngLat={lngLat}>
      <View
        style={[styles.root, { transform: [{ rotate: `${rotation}deg` }] }]}
        collapsable={false}
      >
        <MaterialCommunityIcons
          name="car"
          size={34}
          color="#FFFFFF"
          style={styles.iconOutline}
        />
        <MaterialCommunityIcons name="car" size={30} color="#0F172A" />
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  root: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOutline: {
    position: 'absolute',
  },
});

DriverMarker.displayName = 'DriverMarker';

export default DriverMarker;
