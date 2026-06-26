import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapLibreGL from '../../lib/maplibre';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { normalizeCoordinate } from '../../utils/mapCoords';

/** Punto de retiro con pulso cuando el conductor se acerca. */
export default function PickupMarker({ coordinate, pulse = false, showLabel = false }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);
  const coord = normalizeCoordinate(coordinate);

  useEffect(() => {
    if (!pulse) {
      scale.value = 1;
      opacity.value = 0;
      return;
    }
    scale.value = withRepeat(
      withTiming(2.1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withTiming(0, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [pulse, opacity, scale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!coord) return null;

  return (
    <MapLibreGL.MarkerView
      id={`pickup-${coord.latitude.toFixed(5)}-${coord.longitude.toFixed(5)}`}
      coordinate={[coord.longitude, coord.latitude]}
      tracksViewChanges={pulse}
    >
      <View style={styles.wrap} collapsable={false}>
        {pulse ? <Animated.View style={[styles.ring, ringStyle]} /> : null}
        <View style={[styles.dotOuter, pulse && styles.dotOuterPulse]}>
          <View style={[styles.dotInner, pulse && styles.dotInnerPulse]} />
        </View>
        {showLabel ? (
          <Text style={styles.caption} numberOfLines={1}>Recogida</Text>
        ) : null}
      </View>
    </MapLibreGL.MarkerView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.35)',
  },
  dotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  dotOuterPulse: {
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  dotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0F172A',
  },
  dotInnerPulse: {
    backgroundColor: '#22C55E',
  },
  caption: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    color: '#16A34A',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
