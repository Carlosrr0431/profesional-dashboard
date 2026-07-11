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
import { useResponsive } from '../../hooks/useResponsive';

const VISIBLE_MS = 2200;
const FADE_OUT_MS = 400;

function SuccessPulse({ size = 112 }) {
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

  return (
    <Animated.View
      style={[
        styles.pulseRing,
        { width: size, height: size, borderRadius: size / 2 },
        ringStyle,
      ]}
    />
  );
}

export function TripCompletedOverlay({ onComplete }) {
  const { s, fs } = useResponsive();
  const iconOuter = s(112, { min: 88, max: 128 });
  const iconInner = s(88, { min: 72, max: 104 });

  useEffect(() => {
    const timer = setTimeout(() => onComplete?.(), VISIBLE_MS + FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      exiting={FadeOut.duration(FADE_OUT_MS)}
      style={[styles.root, { paddingHorizontal: s(32, { min: 20, max: 48 }) }]}
      pointerEvents="auto"
    >
      <LinearGradient
        colors={['rgba(26, 31, 74, 0.78)', 'rgba(40, 46, 105, 0.92)']}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View entering={ZoomIn.springify().damping(13).stiffness(140)} style={styles.card}>
        <View style={[styles.iconWrap, { width: iconOuter, height: iconOuter }]}>
          <SuccessPulse size={iconOuter} />
          <View style={[styles.iconCircle, { width: iconInner, height: iconInner, borderRadius: iconInner / 2 }]}>
            <Ionicons name="checkmark" size={Math.round(fs(42))} color="#FFFFFF" />
          </View>
        </View>

        <Animated.Text entering={FadeInUp.delay(120).springify()} style={[styles.title, { fontSize: fs(26) }]}>
          ¡Gracias por viajar!
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(220).springify()} style={[styles.subtitle, { fontSize: fs(16) }]}>
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
  },
  card: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  pulseRing: {
    position: 'absolute',
    backgroundColor: colors.success,
  },
  iconCircle: {
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
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
});
