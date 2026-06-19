import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Marker } from 'react-native-maps';
import { normalizeCoordinate } from '../../utils/mapCoords';

const DRIVER_NAV_PUCK = require('../../../assets/driver-nav-puck.png');

/** Puck de navegación del conductor. */
const DriverNavMarker = React.memo(({ coordinate, heading = 0 }) => {
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
        style={[
          styles.puckWrap,
          { transform: [{ rotate: `${rotation}deg` }] },
        ]}
      >
        <Image source={DRIVER_NAV_PUCK} style={styles.puckImage} resizeMode="contain" />
      </View>
    </Marker>
  );
});

DriverNavMarker.displayName = 'DriverNavMarker';

export default DriverNavMarker;

const styles = StyleSheet.create({
  puckWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puckImage: {
    width: 52,
    height: 52,
  },
});
