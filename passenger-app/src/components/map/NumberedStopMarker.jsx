import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapLibreGL from '../../lib/maplibre';
import { colors } from '../../theme/colors';
import { normalizeCoordinate } from '../../utils/mapCoords';

/** Marcador numerado para paradas en la vista previa de ruta. */
export default function NumberedStopMarker({
  coordinate,
  index,
  isFinal = false,
  caption,
}) {
  const coord = normalizeCoordinate(coordinate);
  if (!coord) return null;

  const label = caption || (isFinal ? 'Destino' : `Parada ${index}`);

  return (
    <MapLibreGL.MarkerView
      id={`stop-${index}-${coord.latitude.toFixed(5)}-${coord.longitude.toFixed(5)}`}
      coordinate={[coord.longitude, coord.latitude]}
    >
      <View style={styles.wrap} collapsable={false}>
        <View style={[styles.badge, isFinal && styles.badgeFinal]}>
          <Text style={[styles.badgeText, isFinal && styles.badgeTextFinal]}>
            {index}
          </Text>
        </View>
        <Text style={[styles.caption, isFinal && styles.captionFinal]} numberOfLines={1}>
          {label}
        </Text>
        <View style={[styles.stem, isFinal && styles.stemFinal]} />
      </View>
    </MapLibreGL.MarkerView>
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
  caption: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    color: colors.primary,
    maxWidth: 72,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  captionFinal: {
    color: colors.accent,
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
