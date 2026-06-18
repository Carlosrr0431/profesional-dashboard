import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { colors } from '../../theme/colors';
import { toLngLat } from '../../utils/mapLibreHelpers';

/**
 * Marcador numerado para paradas en la vista previa de ruta.
 */
export default function NumberedStopMarker({
  coordinate,
  index,
  isFinal = false,
}) {
  const lngLat = toLngLat(coordinate);
  if (!lngLat) return null;

  return (
    <Marker id={`passenger-stop-${index}`} lngLat={lngLat}>
      <View style={styles.wrap} collapsable={false}>
        <View style={[styles.badge, isFinal && styles.badgeFinal]}>
          <Text style={[styles.badgeText, isFinal && styles.badgeTextFinal]}>
            {index}
          </Text>
        </View>
        <View style={[styles.stem, isFinal && styles.stemFinal]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 5,
  },
  badgeFinal: {
    backgroundColor: colors.accent,
    minWidth: 28,
    height: 28,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 16,
  },
  badgeTextFinal: {
    fontSize: 12,
  },
  stem: {
    width: 2,
    height: 6,
    backgroundColor: colors.primary,
    marginTop: -1,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  stemFinal: {
    backgroundColor: colors.accent,
  },
});
