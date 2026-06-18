import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/layout';

function SearchingPulse() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.85);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.35, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity, scale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, ringStyle]} />
      <View style={styles.pulseCore} />
    </View>
  );
}

function StatusIcon({ status, pulse }) {
  if (pulse) return <SearchingPulse />;

  const isSuccess = status === 'completed';
  const isCancelled = status === 'cancelled';

  return (
    <View style={[styles.statusIconStatic, isSuccess && styles.statusIconSuccess]}>
      <Ionicons
        name={isSuccess ? 'checkmark' : isCancelled ? 'close' : 'car'}
        size={18}
        color={isCancelled ? colors.danger : colors.textInverse}
      />
    </View>
  );
}

function TripProgressBar({ progress, animated = false, compact = false }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (!animated) return undefined;
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return undefined;
  }, [animated, shimmer]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(8, progress * 100))}%`,
    opacity: animated ? 0.55 + shimmer.value * 0.45 : 1,
  }));

  return (
    <View style={[styles.progressTrack, compact && styles.progressTrackCompact]}>
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

function AddressTimeline({ pickup, destination, compact = false }) {
  return (
    <View style={styles.timeline}>
      <View style={styles.timelineRow}>
        <View style={styles.timelineRail}>
          <View style={styles.timelineDotPickup} />
          {destination ? <View style={styles.timelineLine} /> : null}
        </View>
        <Text style={styles.timelineAddress} numberOfLines={2}>
          {pickup || 'Obteniendo dirección...'}
        </Text>
      </View>
      {destination ? (
        <View style={[styles.timelineRow, styles.timelineRowDest, compact && styles.timelineRowDestCompact]}>
          <View style={styles.timelineRail}>
            <View style={styles.timelineDotDest} />
          </View>
          <Text style={styles.timelineAddress} numberOfLines={2}>
            {destination}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function DriverRow({ driver }) {
  return (
    <View style={styles.driverRow}>
      <View style={styles.driverAvatar}>
        <Ionicons name="person" size={22} color={colors.primary} />
      </View>
      <View style={styles.driverMeta}>
        <Text style={styles.driverName}>{driver.full_name || 'Tu conductor'}</Text>
        {driver.vehicle_model ? (
          <Text style={styles.driverVehicle}>{driver.vehicle_model}</Text>
        ) : null}
      </View>
      {driver.vehicle_plate ? (
        <View style={styles.platePill}>
          <Text style={styles.plateText}>{driver.vehicle_plate}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TripActiveSheet({
  status,
  cfg,
  pickupAddress,
  destinationAddress,
  driver = null,
  showDriverCard = false,
  tripPrice = null,
  tripDistanceKm = null,
  isSearching = false,
  isFinished = false,
  onCancel,
  onFinish,
  isCancelling = false,
}) {
  if (!cfg) return null;

  const compact = isSearching;

  return (
    <Animated.View entering={FadeIn.duration(280)} style={[styles.sheet, compact && styles.sheetCompact]}>
      <Animated.View entering={FadeInDown.duration(340).delay(30)} style={styles.handleWrap}>
        <View style={styles.dragHandle} />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(360).delay(60)} style={[styles.statusBlock, compact && styles.statusBlockCompact]}>
        <StatusIcon status={status} pulse={cfg.pulse} />
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>{cfg.label}</Text>
          <Text style={styles.statusSubtitle}>{cfg.desc}</Text>
        </View>
      </Animated.View>

      {!isFinished ? (
        <Animated.View entering={FadeIn.duration(400).delay(90)}>
          <TripProgressBar progress={cfg.progress} animated={cfg.pulse} compact={compact} />
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(380).delay(120)}>
        <AddressTimeline pickup={pickupAddress} destination={destinationAddress} compact={compact} />
      </Animated.View>

      {showDriverCard && driver ? (
        <Animated.View entering={FadeInDown.duration(400).delay(160)}>
          <View style={styles.divider} />
          <DriverRow driver={driver} />
        </Animated.View>
      ) : null}

      {status === 'completed' && tripPrice != null ? (
        <View style={styles.fareBlock}>
          <Text style={styles.fareLabel}>Total</Text>
          <Text style={styles.fareAmount}>
            ${tripPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </Text>
          {tripDistanceKm != null && tripDistanceKm > 0 ? (
            <Text style={styles.fareMeta}>
              {tripDistanceKm.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
            </Text>
          ) : null}
        </View>
      ) : null}

      {cfg.canCancel && onCancel ? (
        <Animated.View entering={FadeIn.duration(380).delay(180)}>
          <Pressable
            onPress={onCancel}
            disabled={isCancelling}
            style={({ pressed }) => [
              styles.cancelPressable,
              compact && styles.cancelPressableCompact,
              pressed && { opacity: 0.55 },
            ]}
          >
            {isCancelling ? (
              <ActivityIndicator color={colors.textMuted} size="small" />
            ) : (
              <Text style={styles.cancelText}>
                {isSearching ? 'Cancelar solicitud' : 'Cancelar viaje'}
              </Text>
            )}
          </Pressable>
        </Animated.View>
      ) : null}

      {isFinished && status !== 'completed' && onFinish ? (
        <Pressable
          onPress={onFinish}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.primaryBtnText}>Volver al inicio</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flexShrink: 0,
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  sheetCompact: {
    gap: spacing.xs,
    paddingTop: 0,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  statusBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  statusBlockCompact: {
    marginBottom: 0,
  },
  statusCopy: { flex: 1 },
  statusTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: -0.4,
  },
  statusSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 3,
    lineHeight: 20,
  },
  pulseWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.primary}22`,
  },
  pulseCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  statusIconStatic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconSuccess: {
    backgroundColor: colors.success,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#EEF1F6',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressTrackCompact: {
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  timelineRowDest: { marginTop: spacing.md },
  timelineRowDestCompact: { marginTop: spacing.sm },
  timelineRail: { width: 16, alignItems: 'center' },
  timelineDotPickup: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 22,
    backgroundColor: '#CBD5E1',
    marginTop: 6,
    marginBottom: 2,
  },
  timelineDotDest: {
    width: 8,
    height: 8,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  timelineAddress: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: colors.textDark,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMeta: { flex: 1 },
  driverName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    letterSpacing: -0.3,
  },
  driverVehicle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 2,
  },
  platePill: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  plateText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  fareBlock: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  fareLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
  },
  fareAmount: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: -1,
    marginTop: 4,
  },
  fareMeta: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textLight,
    marginTop: 4,
  },
  cancelPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    borderRadius: radius.md,
  },
  cancelPressableCompact: {
    paddingVertical: spacing.sm,
    marginTop: 0,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
  },
  primaryBtn: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
});
