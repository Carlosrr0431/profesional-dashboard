/**
 * Marcador del conductor para react-native-maps.
 */
import React from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { normalizeCoordinate } from '../../utils/mapCoords';

export const DriverMarker = ({ coordinate, heading = 0 }) => {
  const coord = normalizeCoordinate(coordinate);
  if (!coord) return null;

  const rotation = Number.isFinite(heading) ? heading : 0;

  return (
    <Marker
      coordinate={coord}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
    >
      <View style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2.5,
        borderColor: '#FFFFFF',
        transform: [{ rotate: `${rotation}deg` }],
        boxShadow: '0 3px 10px rgba(40,46,105,0.45)',
      }}>
        <MaterialCommunityIcons name="navigation" size={20} color="#fff" />
      </View>
    </Marker>
  );
};
