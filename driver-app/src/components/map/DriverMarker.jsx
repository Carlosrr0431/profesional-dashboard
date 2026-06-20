/**
 * Marcador del conductor para MapLibre Native.
 * Se renderiza dentro de <MapLibreGL.MarkerView>.
 */
import React from 'react';
import { View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export const DriverMarker = ({ coordinate, heading = 0 }) => {
  if (!coordinate?.latitude || !coordinate?.longitude) return null;

  const rotation = Number.isFinite(heading) ? heading : 0;

  return (
    <MapLibreGL.MarkerView
      id={`driver-marker-${coordinate.latitude}-${coordinate.longitude}`}
      coordinate={[coordinate.longitude, coordinate.latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={{
        width: 38, height: 38,
        borderRadius: 19,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: '#FFFFFF',
        transform: [{ rotate: `${rotation}deg` }],
        elevation: 5,
      }}>
        <MaterialCommunityIcons name="navigation" size={20} color="#fff" />
      </View>
    </MapLibreGL.MarkerView>
  );
};
