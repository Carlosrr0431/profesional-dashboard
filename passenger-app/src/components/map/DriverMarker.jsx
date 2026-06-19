import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { normalizeCoordinate } from '../../utils/mapCoords';

/** Marcador del conductor (silueta de auto con orientación). */
const DriverMarker = React.memo(({ coordinate, heading = 0 }) => {
  const coord = normalizeCoordinate(coordinate);
  if (!coord) return null;

  const rotation = Number.isFinite(heading) ? heading : 0;

  return (
    <Marker
      coordinate={coord}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
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
