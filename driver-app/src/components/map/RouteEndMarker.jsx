import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { colors } from '../../theme/colors';
import { normalizeCoordinate } from '../../utils/mapCoords';

/** Marca el punto final de la ruta activa. */
const RouteEndMarker = React.memo(({ coordinate, variant = 'destination' }) => {
  const coord = normalizeCoordinate(coordinate);
  const isPickup = variant === 'pickup';

  if (!coord) return null;

  return (
    <Marker coordinate={coord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
      <View style={styles.wrap}>
        <View style={styles.halo} />
        <View style={[styles.pin, isPickup ? styles.pinRound : styles.pinSquare]}>
          <View style={[styles.core, isPickup ? styles.corePickup : styles.coreDest]} />
        </View>
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(40, 46, 105, 0.12)',
  },
  pin: {
    width: 22,
    height: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    boxShadow: '0 2px 6px rgba(15,23,42,0.2)',
  },
  pinRound: {
    borderRadius: 11,
  },
  pinSquare: {
    borderRadius: 5,
  },
  corePickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  coreDest: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});

RouteEndMarker.displayName = 'RouteEndMarker';

export default RouteEndMarker;
