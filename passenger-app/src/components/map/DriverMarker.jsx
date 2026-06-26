import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapLibreGL from '../../lib/maplibre';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { normalizeCoordinate } from '../../utils/mapCoords';

/** Marcador del conductor (silueta de auto con orientación). */
const DriverMarker = React.memo(({ coordinate, heading = 0 }) => {
  const coord = normalizeCoordinate(coordinate);
  if (!coord) return null;

  const rotation = Number.isFinite(heading) ? heading : 0;

  return (
    <MapLibreGL.MarkerView
      id={`driver-${coord.latitude.toFixed(5)}-${coord.longitude.toFixed(5)}`}
      coordinate={[coord.longitude, coord.latitude]}
      tracksViewChanges
    >
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
    </MapLibreGL.MarkerView>
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
