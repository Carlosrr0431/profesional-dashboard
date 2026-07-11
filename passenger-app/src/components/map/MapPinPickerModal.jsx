import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Platform,
  useWindowDimensions,
} from 'react-native';
import MapLibreGL from '../../lib/maplibre';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { radius, shadow, spacing } from '../../theme/layout';
import { reverseGeocode } from '../../services/googleMaps';
import { useLocation } from '../../hooks/useLocation';
import { createMapCameraController } from '../../utils/mapCamera';
import { useResponsive } from '../../hooks/useResponsive';

const SALTA_CENTER = { latitude: -24.7829, longitude: -65.4122 };
const PICKER_DELTA = { latitudeDelta: 0.006, longitudeDelta: 0.006 };
const GEOCODE_DEBOUNCE_MS = 350;
const BOTTOM_CARD_H = 200;
const PIN_HEIGHT = 40;

const FIELD_CONFIG = {
  pickup: {
    title: 'Punto de recogida',
    subtitle: 'Mové el mapa para ubicar el pin exacto',
    pinColor: colors.accentLight,
    pinInner: colors.accent,
    icon: 'radio-button-on',
    confirmLabel: 'Confirmar recogida',
  },
  destination: {
    title: 'Punto de destino',
    subtitle: 'Mové el mapa para ubicar el pin exacto',
    pinColor: colors.primary,
    pinInner: colors.primaryDark,
    icon: 'location',
    confirmLabel: 'Confirmar destino',
  },
};

function CenterMapPin({ fieldType, isDragging, topInset }) {
  const lift = useSharedValue(0);
  const { height: screenH } = useWindowDimensions();
  const { s, isLandscape } = useResponsive();
  const config = FIELD_CONFIG[fieldType] || FIELD_CONFIG.destination;
  const isPickup = fieldType === 'pickup';
  const bottomCardH = s(BOTTOM_CARD_H, { min: 160 });
  const pinHeight = s(PIN_HEIGHT, { min: 32 });

  useEffect(() => {
    lift.value = withSpring(isDragging ? -14 : 0, { damping: 16, stiffness: 280 });
  }, [isDragging, lift]);

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: isDragging ? 0.25 : 0.45,
    transform: [{ scaleX: isDragging ? 0.65 : 1 }, { scaleY: isDragging ? 0.65 : 1 }],
  }));

  const topPad = topInset + s(isLandscape ? 64 : 88);
  const bottomPad = bottomCardH + Math.max(topInset, spacing.lg);
  const pinTop = topPad + (screenH - topPad - bottomPad) / 2 - pinHeight;

  return (
    <View style={[styles.pinOverlay, { top: pinTop }]} pointerEvents="none">
      <Animated.View style={[styles.pinShadow, shadowStyle]} />
      <Animated.View style={[styles.pinBody, pinStyle]}>
        <View style={styles.pinDot}>
          <View
            style={[
              styles.pinDotInner,
              isPickup ? styles.pinDotPickup : styles.pinDotDest,
              { backgroundColor: config.pinInner },
            ]}
          />
        </View>
        <View style={[styles.pinLine, { backgroundColor: config.pinInner, height: pinHeight - 12 }]} />
      </Animated.View>
    </View>
  );
}

function extractCenterFromMapEvent(event) {
  const geometryCoords = event?.geometry?.coordinates;
  if (Array.isArray(geometryCoords) && geometryCoords.length >= 2) {
    const lng = Number(geometryCoords[0]);
    const lat = Number(geometryCoords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }

  const center = event?.properties?.center || event?.nativeEvent?.centerCoordinate;
  if (Array.isArray(center) && center.length >= 2) {
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }

  const region = event?.nativeEvent?.region;
  if (region) {
    const lat = Number(region.latitude);
    const lng = Number(region.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }

  return null;
}

export default function MapPinPickerModal({
  visible,
  fieldType = 'destination',
  initialCoordinate = null,
  onConfirm,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const { s, isLandscape, isTablet, screenPadding, contentMaxWidth } = useResponsive();
  const bottomCardH = s(BOTTOM_CARD_H, { min: isLandscape ? 140 : 160 });
  const mapViewRef = useRef(null);
  const mapCameraRef = useRef(null);
  const mapRef = useRef(null);
  if (!mapRef.current) {
    mapRef.current = createMapCameraController(mapCameraRef);
  }
  const regionRef = useRef(null);
  const geocodeTimerRef = useRef(null);
  const geocodeRequestIdRef = useRef(0);
  const hasInitializedRef = useRef(false);

  const { getCurrentLocation } = useLocation();

  const [isDragging, setIsDragging] = useState(false);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const config = FIELD_CONFIG[fieldType] || FIELD_CONFIG.destination;
  const runReverseGeocode = useCallback(async (lat, lng) => {
    const requestId = ++geocodeRequestIdRef.current;
    setGeocoding(true);
    try {
      const result = await reverseGeocode(lat, lng);
      if (requestId !== geocodeRequestIdRef.current) return;
      setAddress(result);
      setCoords({ lat, lng });
    } finally {
      if (requestId === geocodeRequestIdRef.current) {
        setGeocoding(false);
      }
    }
  }, []);

  const scheduleGeocode = useCallback(
    (region) => {
      if (!region) return;
      regionRef.current = region;
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = setTimeout(() => {
        runReverseGeocode(region.latitude, region.longitude);
      }, GEOCODE_DEBOUNCE_MS);
    },
    [runReverseGeocode]
  );

  const resolveInitialRegion = useCallback(async () => {
    if (
      initialCoordinate?.latitude != null &&
      initialCoordinate?.longitude != null &&
      Number.isFinite(initialCoordinate.latitude) &&
      Number.isFinite(initialCoordinate.longitude)
    ) {
      return {
        latitude: initialCoordinate.latitude,
        longitude: initialCoordinate.longitude,
        ...PICKER_DELTA,
      };
    }

    try {
      const loc = await getCurrentLocation();
      return { latitude: loc.latitude, longitude: loc.longitude, ...PICKER_DELTA };
    } catch {
      return { ...SALTA_CENTER, ...PICKER_DELTA };
    }
  }, [getCurrentLocation, initialCoordinate]);

  useEffect(() => {
    if (!visible) {
      hasInitializedRef.current = false;
      setMapReady(false);
      setIsDragging(false);
      setAddress('');
      setCoords(null);
      setGeocoding(false);
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      const region = await resolveInitialRegion();
      if (cancelled) return;

      regionRef.current = region;
      setCoords({ lat: region.latitude, lng: region.longitude });
      setGeocoding(true);
      hasInitializedRef.current = true;

      if (mapRef.current) {
        mapRef.current.animateToRegion(region, 0);
      }

      const result = await reverseGeocode(region.latitude, region.longitude);
      if (!cancelled) {
        setAddress(result);
        setGeocoding(false);
      }
    })();

    return () => {
      cancelled = true;
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [visible, resolveInitialRegion]);

  const handleRegionChange = useCallback(() => {
    if (!hasInitializedRef.current) return;
    setIsDragging(true);
  }, []);

  const handleRegionChangeComplete = useCallback(
    (event) => {
      if (!hasInitializedRef.current) return;
      const center = extractCenterFromMapEvent(event);
      if (!center) return;
      setIsDragging(false);
      scheduleGeocode({
        latitude: center.latitude,
        longitude: center.longitude,
      });
    },
    [scheduleGeocode],
  );

  const handleCenterOnUser = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const loc = await getCurrentLocation();
      const region = { latitude: loc.latitude, longitude: loc.longitude, ...PICKER_DELTA };
      regionRef.current = region;
      mapRef.current?.animateToRegion(region, 450);
      scheduleGeocode(region);
    } catch {
      /* sin permisos */
    }
  }, [getCurrentLocation, scheduleGeocode]);

  const handleConfirm = useCallback(() => {
    if (!coords || !address || geocoding) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm?.({
      address,
      lat: coords.lat,
      lng: coords.lng,
      placeId: null,
    });
  }, [address, coords, geocoding, onConfirm]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose?.();
  }, [onClose]);

  const canConfirm =
    !!address &&
    coords != null &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    !geocoding &&
    !isDragging;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        <MapLibreGL.MapView
          ref={mapViewRef}
          style={StyleSheet.absoluteFill}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          onDidFinishLoadingMap={() => setMapReady(true)}
          onRegionIsChanging={handleRegionChange}
          onRegionDidChange={handleRegionChangeComplete}
        >
          <MapLibreGL.Camera
            ref={mapCameraRef}
            defaultSettings={{
              centerCoordinate: [SALTA_CENTER.longitude, SALTA_CENTER.latitude],
              zoomLevel: 15,
            }}
          />
          <MapLibreGL.UserLocation visible />
        </MapLibreGL.MapView>

        {!mapReady ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}

        <CenterMapPin fieldType={fieldType} isDragging={isDragging} topInset={insets.top} />

        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
          </Pressable>

          <View style={styles.titleBlock}>
            <Text style={styles.title}>{config.title}</Text>
            <Text style={styles.subtitle}>{config.subtitle}</Text>
          </View>

          <View style={styles.topBarSpacer} />
        </View>

        <Pressable
          onPress={handleCenterOnUser}
          style={({ pressed }) => [
            styles.locateBtn,
            shadow.float,
            { bottom: bottomCardH + insets.bottom, right: screenPadding },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Ionicons name="locate" size={22} color={colors.primary} />
        </Pressable>

        <View
          style={[
            styles.bottomCard,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              paddingHorizontal: screenPadding,
              ...(isTablet || isLandscape
                ? {
                    left: Math.max(0, (insets.left || 0)),
                    right: Math.max(0, (insets.right || 0)),
                    alignItems: 'center',
                  }
                : null),
            },
          ]}
        >
          <View style={[
            styles.bottomCardInner,
            (isTablet || isLandscape) ? { maxWidth: contentMaxWidth, width: '100%' } : null,
          ]}>
          <View style={styles.addressCard}>
            <View style={[styles.addressIcon, { backgroundColor: `${config.pinInner}18` }]}>
              <Ionicons name={config.icon} size={20} color={config.pinInner} />
            </View>
            <View style={styles.addressTextCol}>
              {geocoding && !address ? (
                <View style={styles.addressLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.addressLoadingText}>Buscando dirección...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.addressLabel}>
                    {isDragging ? 'Soltá para fijar el punto' : 'Ubicación seleccionada'}
                  </Text>
                  <Text style={styles.addressValue} numberOfLines={2}>
                    {address || 'Mové el mapa para elegir un punto'}
                  </Text>
                </>
              )}
            </View>
            {geocoding && address ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.addressSpinner} />
            ) : null}
          </View>

          <Pressable
            onPress={handleConfirm}
            disabled={!canConfirm}
            style={({ pressed }) => [
              styles.confirmBtn,
              !canConfirm && styles.confirmBtnDisabled,
              pressed && canConfirm && { opacity: 0.94 },
            ]}
          >
            <LinearGradient
              colors={canConfirm ? colors.gradient.brand : ['#D8DEE8', '#C8D0DC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.confirmBtnGrad}
            >
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>{config.confirmLabel}</Text>
            </LinearGradient>
          </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    zIndex: 2,
  },
  pinOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
    height: PIN_HEIGHT,
  },
  pinShadow: {
    position: 'absolute',
    bottom: 0,
    width: 16,
    height: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
  },
  pinBody: {
    alignItems: 'center',
  },
  pinDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  pinDotInner: {
    width: 10,
    height: 10,
  },
  pinDotPickup: {
    borderRadius: 5,
  },
  pinDotDest: {
    borderRadius: 2,
  },
  pinLine: {
    width: 2,
    height: 10,
    borderRadius: 1,
    marginTop: -1,
    opacity: 0.85,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadow.soft,
  },
  backBtnPressed: { opacity: 0.88 },
  titleBlock: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadow.soft,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 2,
  },
  topBarSpacer: { width: 44 },
  locateBtn: {
    position: 'absolute',
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    zIndex: 4,
  },
  bottomCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadow.float,
  },
  bottomCardInner: {
    width: '100%',
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  addressIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressTextCol: { flex: 1, minWidth: 0 },
  addressLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  addressValue: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    marginTop: 3,
    lineHeight: 20,
  },
  addressLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addressLoadingText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
  },
  addressSpinner: { marginLeft: spacing.xs },
  confirmBtn: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  confirmBtnDisabled: { opacity: 0.55 },
  confirmBtnGrad: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  confirmBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
});
