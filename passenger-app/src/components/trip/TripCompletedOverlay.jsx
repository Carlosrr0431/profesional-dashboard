import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

const VISIBLE_MS = 2200;
const FADE_OUT_MS = 400;

function SuccessPulse() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.45, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(0.12, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity, scale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.pulseRing, ringStyle]} />;
}

export function TripCompletedOverlay({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(() => onComplete?.(), VISIBLE_MS + FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      exiting={FadeOut.duration(FADE_OUT_MS)}
      style={styles.root}
      pointerEvents="auto"
    >
      <LinearGradient
        colors={['rgba(26, 31, 74, 0.78)', 'rgba(40, 46, 105, 0.92)']}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View entering={ZoomIn.springify().damping(13).stiffness(140)} style={styles.card}>
        <View style={styles.iconWrap}>
          <SuccessPulse />
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={42} color="#FFFFFF" />
          </View>
        </View>

        <Animated.Text entering={FadeInUp.delay(120).springify()} style={styles.title}>
          ¡Gracias por viajar!
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(220).springify()} style={styles.subtitle}>
          Esperamos verte pronto de nuevo
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    paddingHorizontal: 32,
  },
  card: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconWrap: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  pulseRing: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.success,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.successDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
});
