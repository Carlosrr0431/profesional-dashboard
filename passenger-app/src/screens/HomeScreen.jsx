import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  StyleSheet,
  AppState,
  Modal,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { Map, Camera, UserLocation } from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { colors } from '../theme/colors';
import { radius, shadow, spacing } from '../theme/layout';
import { useLocation } from '../hooks/useLocation';
import { useTripStore } from '../stores/tripStore';
import { useTrip } from '../hooks/useTrip';
import { useTripRealtime } from '../hooks/useRealtime';
import { usePassengerActiveTrip } from '../hooks/usePassengerActiveTrip';
import ExpandableTripSheet from '../components/home/ExpandableTripSheet';
import TripPlanRouteOverlay from '../components/map/TripPlanRouteOverlay';
import ActiveTripMapOverlay from '../components/map/ActiveTripMapOverlay';
import { TripCompletedOverlay } from '../components/trip/TripCompletedOverlay';
import { MAP_STYLE_URL } from '../utils/mapConfig';
import { regionToInitialViewState } from '../utils/mapLibreHelpers';
import { createMapCameraController } from '../utils/mapCamera';

const SALTA_DELTA = { latitudeDelta: 0.04, longitudeDelta: 0.04 };
const SALTA_CENTER = { latitude: -24.7829, longitude: -65.4122 };

const LIVE_TRIP_STATUSES = new Set([
  'queued',
  'pending',
  'accepted',
  'going_to_pickup',
  'in_progress',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const navigation = useNavigation();
  const cameraRef = useRef(null);
  const mapRef = useRef(null);
  if (!mapRef.current) {
    mapRef.current = createMapCameraController(cameraRef);
  }
  const appStateRef = useRef(AppState.currentState);

  const { location, isLoading: locationLoading } = useLocation();
  const { activeTrip, activeTripId, setActiveTrip, loadPersistedTripId } = useTripStore();
  const { fetchTrip } = useTrip();

  const tripStatus = activeTrip?.status ?? null;
  const hasLiveTripMap = Boolean(activeTrip && LIVE_TRIP_STATUSES.has(tripStatus));
  const hasActiveTripSheet = Boolean(
    activeTrip && (LIVE_TRIP_STATUSES.has(tripStatus) || tripStatus === 'cancelled')
  );

  const [menuVisible, setMenuVisible] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [locateBtnBottom, setLocateBtnBottom] = useState(120);
  const [routePreview, setRoutePreview] = useState({
    active: false,
    pickup: null,
    paradas: [],
  });

  const tripLive = usePassengerActiveTrip({
    mapRef,
    topInset: insets.top,
    sheetBottom: locateBtnBottom,
    screenHeight: screenH,
    enabled: Boolean(activeTrip),
  });

  useTripRealtime(
    activeTrip?.id ?? null,
    activeTrip?.driver_id ?? null,
    activeTrip?.tracking_token ?? null
  );

  const mapPadding = useMemo(
    () => ({
      top: insets.top + clamp(Math.round(screenH * 0.13), 84, 104),
      right: clamp(Math.round(screenW * 0.13), 44, 56),
      bottom: locateBtnBottom + clamp(Math.round(screenH * 0.045), 28, 40),
      left: clamp(Math.round(screenW * 0.17), 56, 76),
    }),
    [locateBtnBottom, insets.top, screenH, screenW]
  );

  useEffect(() => {
    const restore = async () => {
      if (activeTripId) return;
      const persistedId = await loadPersistedTripId();
      if (!persistedId) return;
      const trip = await fetchTrip(persistedId);
      if (trip && !['completed', 'cancelled'].includes(trip.status)) {
        setActiveTrip(trip);
      }
    };
    restore();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'background' && nextState === 'active' && activeTripId) {
        fetchTrip(activeTripId).then((trip) => {
          if (trip) setActiveTrip(trip);
        });
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [activeTripId]);

  const handleCenterMap = useCallback(() => {
    if (!location || !mapRef.current) return;
    mapRef.current.animateToRegion({ ...location, ...SALTA_DELTA }, 400);
  }, [location]);

  useEffect(() => {
    if (!hasLiveTripMap || !routePreview.active) return;
    setRoutePreview({ active: false, pickup: null, paradas: [] });
  }, [hasLiveTripMap, routePreview.active]);

  useEffect(() => {
    if (routePreview.active || hasLiveTripMap) return;
    if (location && !locationLoading && mapRef.current) {
      mapRef.current.animateToRegion({ ...location, ...SALTA_DELTA }, 600);
    }
  }, [locationLoading, routePreview.active, hasLiveTripMap, location]);

  const handleSheetLayout = useCallback((bottomOffset) => {
    setLocateBtnBottom(bottomOffset + 16);
  }, []);

  const handleRoutePreviewChange = useCallback((preview) => {
    setRoutePreview((prev) => {
      if (
        prev.active === preview.active
        && prev.pickup === preview.pickup
        && prev.paradas === preview.paradas
      ) {
        return prev;
      }
      return preview;
    });
  }, []);

  const handleActiveTripCancel = useCallback(() => {
    const cancel = tripLive.handleCancel();
    if (!cancel) return;

    Alert.alert(cancel.title, cancel.message, [
      { text: 'No, mantener', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          const result = await cancel.onConfirm();
          if (result?.ok) {
            Toast.show({
              type: 'success',
              text1: tripLive.isSearching ? 'Solicitud cancelada' : 'Viaje cancelado',
            });
          } else {
            Toast.show({
              type: 'error',
              text1: 'No se pudo cancelar',
              text2: result?.error,
            });
          }
        },
      },
    ]);
  }, [tripLive]);

  const handleActiveTripFinish = useCallback(async () => {
    await tripLive.handleFinish();
  }, [tripLive]);

  const openMenuScreen = useCallback(
    (screen) => {
      setMenuVisible(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate(screen);
    },
    [navigation]
  );

  const initialViewState = useMemo(
    () => regionToInitialViewState({ ...SALTA_CENTER, ...SALTA_DELTA }),
    []
  );

  const activeTripUi = hasActiveTripSheet
    ? {
      status: tripLive.status,
      cfg: tripLive.cfg,
      pickupAddress: tripLive.pickupDisplayAddress,
      destinationAddress: tripLive.destinationDisplayAddress,
      driver: tripLive.driver,
      showDriverCard: tripLive.showDriverCard,
      tripPrice: tripLive.tripPrice,
      tripDistanceKm: tripLive.tripDistanceKm,
      isSearching: tripLive.isSearching,
      isFinished: tripLive.isFinished,
      isCancelling: tripLive.isCancelling,
      onCancel: handleActiveTripCancel,
      onFinish: handleActiveTripFinish,
    }
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <Map
        mapStyle={MAP_STYLE_URL}
        style={StyleSheet.absoluteFill}
        logo={false}
        attributionPosition={{ bottom: 8, left: 8 }}
        pointerEvents={sheetExpanded ? 'none' : 'auto'}
      >
        <Camera ref={cameraRef} initialViewState={initialViewState} />

        {!tripLive.showDriverOnMap ? <UserLocation /> : null}

        {hasLiveTripMap ? (
          <ActiveTripMapOverlay
            pickupCoord={tripLive.pickupCoord}
            destinationCoord={tripLive.destinationCoord}
            smoothDriverCoord={tripLive.smoothDriverCoord}
            markerHeading={tripLive.markerHeading}
            remainingPath={tripLive.remainingPath}
            fullTripRoute={tripLive.fullTripRoute}
            isSearching={tripLive.isSearching}
            isEnRouteToPickup={tripLive.isEnRouteToPickup}
            isEnRouteToDestination={tripLive.isEnRouteToDestination}
            isFinished={tripLive.isFinished}
            showDriver={tripLive.showDriverOnMap}
            driverNearTarget={tripLive.driverNearTarget}
          />
        ) : null}

        {!hasLiveTripMap && routePreview.active ? (
          <TripPlanRouteOverlay
            pickup={routePreview.pickup}
            paradas={routePreview.paradas}
            mapRef={mapRef}
            mapPadding={mapPadding}
          />
        ) : null}
      </Map>

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMenuVisible(true);
          }}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
        >
          <Ionicons name="menu" size={22} color={colors.primary} />
        </Pressable>

        <View style={[styles.brandChip, shadow.soft]}>
          <LinearGradient
            colors={colors.gradient.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandIcon}
          >
            <Ionicons name="car-sport" size={18} color="#FFFFFF" />
          </LinearGradient>
          <View style={styles.brandText}>
            <Text style={styles.brandTitle}>Profesional</Text>
            <Text style={styles.brandSub}>Salta Capital</Text>
          </View>
        </View>

        <View style={styles.iconBtnPlaceholder} />
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Pressable
            style={[
              styles.menuPanel,
              { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <LinearGradient
              colors={colors.gradient.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuHero}
            >
              <View style={styles.menuHeroIcon}>
                <Ionicons name="car-sport" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.menuBrand}>Profesional</Text>
              <Text style={styles.menuBrandSub}>App Pasajero</Text>
            </LinearGradient>

            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => openMenuScreen('History')}
            >
              <View style={styles.menuItemIcon}>
                <Ionicons name="time-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.menuItemText}>Mis viajes</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => openMenuScreen('Profile')}
            >
              <View style={styles.menuItemIcon}>
                <Ionicons name="person-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.menuItemText}>Mi perfil</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </Pressable>

            <Pressable style={styles.menuClose} onPress={() => setMenuVisible(false)}>
              <Text style={styles.menuCloseText}>Cerrar menú</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {!sheetExpanded && !hasActiveTripSheet && (
        <Pressable
          onPress={handleCenterMap}
          style={({ pressed }) => [
            styles.locateBtn,
            shadow.float,
            { bottom: locateBtnBottom },
            pressed && { opacity: 0.92 },
          ]}
        >
          <LinearGradient
            colors={['#FFFFFF', colors.accentSoft]}
            style={styles.locateBtnInner}
          >
            <Ionicons name="locate" size={22} color={colors.primary} />
          </LinearGradient>
        </Pressable>
      )}

      {tripLive.showCompletionOverlay && tripStatus === 'completed' ? (
        <TripCompletedOverlay onComplete={tripLive.handleCompletionFinished} />
      ) : null}

      <ExpandableTripSheet
        bottomInset={insets.bottom}
        onExpandedChange={setSheetExpanded}
        onSheetLayout={handleSheetLayout}
        onRoutePreviewChange={handleRoutePreviewChange}
        activeTripUi={activeTripUi}
        onActiveTripFinish={handleActiveTripFinish}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  iconBtnPressed: { opacity: 0.88 },
  iconBtnPlaceholder: { width: 44 },

  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingRight: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { alignItems: 'center' },
  brandTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: -0.2,
  },
  brandSub: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
    marginTop: 1,
  },

  locateBtn: {
    position: 'absolute',
    right: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    overflow: 'hidden',
    zIndex: 11,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  locateBtnInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  menuPanel: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.float,
  },
  menuHero: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  menuHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  menuBrand: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  menuBrandSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  menuItemPressed: { backgroundColor: colors.accentSoft },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
  },
  menuClose: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginTop: spacing.sm,
  },
  menuCloseText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
  },
});
