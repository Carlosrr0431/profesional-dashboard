import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Keyboard,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
  PixelRatio,
  Dimensions,
} from 'react-native';
import * as Location from 'expo-location';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { radius, shadow, spacing } from '../../theme/layout';
import { useAuthStore } from '../../stores/authStore';
import { useTrip } from '../../hooks/useTrip';
import { useTripStore } from '../../stores/tripStore';
import { useServiceZoneCoverage } from '../../hooks/useServiceZoneCoverage';
import { reverseGeocode, resolvePlaceFromSuggestion } from '../../services/googleMaps';
import { estimatePassengerTripFare } from '../../services/tripPricing';
import { loadFrequentPlaces, addRecentPlace } from '../../services/recentPlaces';
import { formatArs } from '../../utils/formatMoney';
import PickupCoverageBanner from '../ui/PickupCoverageBanner';
import TripRouteInputs, {
  ACTIVE_FIELD,
  MAX_PARADAS,
  makeParadaField,
  isParadaField,
  paradaIndexFromField,
} from './TripRouteInputs';
import StopDestinationSheet from './StopDestinationSheet';
import MapPinPickerModal from '../map/MapPinPickerModal';
import TripActiveSheet from '../trip/TripActiveSheet';
import {
  getTripPickupDisplayAddress,
  getTripDestinationDisplayAddress,
} from '../../utils/tripDisplayAddresses';
import { useResponsive } from '../../hooks/useResponsive';
import { CONTENT_MAX_WIDTH } from '../../utils/responsive';

function sheetHorizontalMargin(screenWidth) {
  return clamp(Math.round(screenWidth * 0.042), spacing.md, spacing.lg);
}
const KEYBOARD_SHEET_GAP = 8;
const SHEET_BOTTOM_GAP = 12;
const COLLAPSED_SHEET_EXTRA_BOTTOM = spacing.lg;
const DISMISS_DRAG_PX = 100;
const DISMISS_VELOCITY = 700;

const DEFAULT_SHEET_RATIOS = {
  browse: 0.84,
  confirmationMin: 0.78,
  absoluteMin: 0.32,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scaleByFont(base, fontScale) {
  return Math.round(base * clamp(fontScale, 1, 1.35));
}

function computeReviewSheetMetrics({
  layoutScreenH,
  topInset,
  bottomInset,
  fontScale,
  stopCount,
}) {
  const scale = (base) => scaleByFont(base, fontScale);

  const sheetBottomCollapsed = Math.max(bottomInset, SHEET_BOTTOM_GAP) + spacing.sm;
  const maxSheetH = Math.max(
    scale(220),
    layoutScreenH - topInset - sheetBottomCollapsed - spacing.xs
  );

  const innerPadV = spacing.sm * 2;
  const sectionGap = spacing.sm;
  const handleH = scale(22);
  const stopRowH = scale(48);
  const routeCardPadV = scale(16);
  const editRowH = scale(34);
  const routeRowGap = scale(8);
  const totalRows = 1 + Math.max(0, stopCount);
  const routeCardH =
    routeCardPadV
    + totalRows * stopRowH
    + Math.max(0, totalRows - 1) * routeRowGap
    + editRowH;
  const fareH = scale(56);
  const confirmH = scale(56);
  const fixedChrome = innerPadV + handleH + fareH + confirmH + sectionGap * 3;
  const totalNatural = fixedChrome + routeCardH;

  if (totalNatural <= maxSheetH) {
    return {
      reviewSheetH: totalNatural,
      routeStopsMaxHeight: null,
      needsRouteScroll: false,
    };
  }

  const routeCardBudget = Math.max(scale(120), maxSheetH - fixedChrome);
  const routeStopsMaxHeight = Math.max(
    scale(96),
    routeCardBudget - editRowH - routeCardPadV
  );

  return {
    reviewSheetH: maxSheetH,
    routeStopsMaxHeight,
    needsRouteScroll: true,
  };
}

function buildReviewUiScale(fontScale) {
  const scale = (base) => scaleByFont(base, fontScale);
  return {
    stopMinHeight: scale(48),
    editRowMinHeight: scale(30),
    routeTextSize: scale(13),
    editHintSize: scale(12),
    fareLabelSize: scale(10),
    farePriceSize: scale(20),
    fareMetaSize: scale(12),
    fareLoadingSize: scale(12),
    confirmBtnHeight: scale(52),
    confirmTextSize: scale(17),
    confirmIconSize: scale(22),
    editIconSize: scale(15),
    chevronSize: scale(16),
    dotSize: scale(9),
  };
}

function computeCollapsedContentHeight(fontScale) {
  const iconSize = scaleByFont(48, fontScale);
  const pillPadV = spacing.sm * 2;
  const innerPadV = spacing.md * 2;
  return iconSize + pillPadV + innerPadV;
}

function computeSheetMetrics({
  layoutScreenH,
  topInset,
  bottomInset,
  keyboardHeight,
  keyboardSearchMode,
  confirmationMode,
  activeSearchMode,
  listItemCount,
  suggestionsLoading,
  fontScale,
  tripReviewMode,
  stopCount = 0,
  sheetRatios = DEFAULT_SHEET_RATIOS,
}) {
  const ratios = sheetRatios || DEFAULT_SHEET_RATIOS;
  const collapsedH = computeCollapsedContentHeight(fontScale);
  const sheetBottomGap = Math.max(bottomInset, SHEET_BOTTOM_GAP);
  const sheetBottomExpanded = keyboardSearchMode && !tripReviewMode
    ? keyboardHeight + KEYBOARD_SHEET_GAP
    : sheetBottomGap;
  const sheetBottomCollapsed = sheetBottomGap + COLLAPSED_SHEET_EXTRA_BOTTOM;
  const topSafeMargin = topInset + spacing.sm;

  const maxSheetHeight = Math.max(
    Math.round(layoutScreenH * ratios.absoluteMin),
    layoutScreenH - sheetBottomGap - topSafeMargin
  );

  // Con teclado: el sheet no puede ser más alto que el espacio entre teclado y status bar.
  const maxHeightAboveKeyboard = keyboardSearchMode
    ? Math.max(
      scaleByFont(168, fontScale),
      layoutScreenH - keyboardHeight - KEYBOARD_SHEET_GAP - topSafeMargin
    )
    : maxSheetHeight;

  const chromeH = scaleByFont(44, fontScale);
  const routeH = confirmationMode
    ? scaleByFont(188 + stopCount * 48, fontScale)
    : scaleByFont(168 + stopCount * 48, fontScale);
  const listRowH = scaleByFont(66, fontScale);
  const fareH = scaleByFont(120, fontScale);
  const footerH = scaleByFont(140, fontScale);

  const confirmationContentH =
    chromeH + routeH + fareH + footerH + spacing.xl * 3 + spacing.lg;

  const browseSheetHeight = Math.round(maxSheetHeight * ratios.browse);

  const confirmationSheetHeight = clamp(
    Math.max(confirmationContentH, Math.round(maxSheetHeight * ratios.confirmationMin)),
    Math.round(maxSheetHeight * ratios.absoluteMin),
    maxSheetHeight
  );

  let expandedSheetHeight;
  let expandedSheetSizeStyle;

  if (confirmationMode) {
    expandedSheetHeight = confirmationSheetHeight;
    expandedSheetSizeStyle = {
      height: confirmationSheetHeight,
      maxHeight: maxSheetHeight,
      minHeight: Math.min(confirmationContentH, maxSheetHeight),
    };
  } else if (activeSearchMode) {
    // Misma altura que browse: no achicar el modal al mostrar POIs o buscar direcciones.
    const fixedSearchH = browseSheetHeight;
    expandedSheetHeight = keyboardSearchMode
      ? Math.min(fixedSearchH, maxHeightAboveKeyboard)
      : fixedSearchH;
    expandedSheetSizeStyle = {
      height: expandedSheetHeight,
      maxHeight: keyboardSearchMode ? maxHeightAboveKeyboard : maxSheetHeight,
    };
  } else {
    const footerBrowseH = scaleByFont(72, fontScale);
    const browseContentH =
      chromeH
      + routeH
      + footerBrowseH
      + (listItemCount > 0 ? 28 : 56)
      + listItemCount * listRowH
      + spacing.lg;
    expandedSheetHeight = clamp(
      browseContentH,
      scaleByFont(260, fontScale),
      browseSheetHeight
    );
    expandedSheetSizeStyle = {
      height: expandedSheetHeight,
      maxHeight: maxSheetHeight,
    };
  }

  return {
    collapsedH,
    sheetBottomGap,
    sheetBottomCollapsed,
    sheetBottomExpanded,
    maxSheetHeight,
    expandedSheetHeight,
    expandedSheetSizeStyle,
    dismissAnchor: maxSheetHeight * 0.75,
  };
}

export default function ExpandableTripSheet({
  bottomInset = 0,
  onExpandedChange,
  onSheetLayout,
  onTripCreated,
  onRoutePreviewChange,
  activeTripUi = null,
  onActiveTripFinish,
  getCurrentLocation,
}) {
  const pickupInputRef = useRef(null);
  const firstParadaInputRef = useRef(null);

  const insets = useSafeAreaInsets();
  const { height: windowH, width: screenW } = useWindowDimensions();
  const { sheetRatios, isLandscape, contentMaxWidth } = useResponsive();
  const fontScale = PixelRatio.getFontScale();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const safeBottom = Math.max(bottomInset, insets.bottom);
  const layoutScreenH = Math.max(
    windowH,
    Dimensions.get('screen').height - topInset - safeBottom
  );
  const sheetHMargin = sheetHorizontalMargin(
    isLandscape ? Math.min(screenW, contentMaxWidth) : screenW
  );
  const { profile } = useAuthStore();
  const { requestTrip, fetchTripHistory } = useTrip();
  const { isCreating, activeTrip } = useTripStore();

  const dragY = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const dismissAnchorSv = useSharedValue(400);
  const isSearchingSv = useSharedValue(0);
  const [expanded, setExpanded] = useState(false);
  const [pickup, setPickup] = useState(null);
  const {
    pickupOutsideCoverage,
    validatePickupForTrip,
    notifyPickupOutsideCoverage,
  } = useServiceZoneCoverage(pickup);
  const [paradas, setParadas] = useState([]);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [recentPlaces, setRecentPlaces] = useState([]);
  const [activeField, setActiveField] = useState(ACTIVE_FIELD.firstParada);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [fareLoading, setFareLoading] = useState(false);
  const [mapPickerField, setMapPickerField] = useState(null);
  const [stopSheet, setStopSheet] = useState({ visible: false, index: 0 });
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const dismissLayoutRef = useRef(null);
  const dismissTimerRef = useRef(null);

  const tripStatus = activeTrip?.status ?? null;
  const activeTripMode = Boolean(activeTripUi);

  useEffect(() => {
    const onShow = (event) => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
    };
    const onHide = () => {
      setKeyboardHeight(0);
    };

    const subs = [
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardDidHide', onHide),
    ];
    if (Platform.OS === 'ios') {
      subs.push(
        Keyboard.addListener('keyboardWillShow', onShow),
        Keyboard.addListener('keyboardWillHide', onHide)
      );
    }

    return () => {
      subs.forEach((sub) => sub.remove());
    };
  }, []);

  const finalParada = paradas.length > 0 ? paradas[paradas.length - 1] : null;

  const intermediateWaypoints = useMemo(
    () => (paradas.length > 1 ? paradas.slice(0, -1) : []),
    [paradas]
  );

  const paradasAreComplete = paradas.length > 0
    && paradas.every(
      (parada) => parada?.address
        && Number.isFinite(parada?.lat)
        && Number.isFinite(parada?.lng)
    );

  const routeReviewVisible =
    !activeTripMode
    && paradasAreComplete
    && Number.isFinite(pickup?.lat)
    && Number.isFinite(pickup?.lng)
    && !expanded
    && !isDismissing;

  const activeTripSheetH = useMemo(() => {
    if (activeTripUi?.isSearching) return scaleByFont(230, fontScale);
    if (activeTripUi?.showDriverCard) return scaleByFont(378, fontScale);
    if (activeTripUi?.isFinished) return scaleByFont(272, fontScale);
    return scaleByFont(292, fontScale);
  }, [fontScale, activeTripUi?.isSearching, activeTripUi?.showDriverCard, activeTripUi?.isFinished]);

  const reviewMetrics = useMemo(
    () => computeReviewSheetMetrics({
      layoutScreenH,
      topInset,
      bottomInset: safeBottom,
      fontScale,
      stopCount: paradas.length,
    }),
    [layoutScreenH, topInset, safeBottom, fontScale, paradas.length]
  );

  const reviewUi = useMemo(() => buildReviewUiScale(fontScale), [fontScale]);

  const keyboardSearchMode = keyboardHeight > 0;
  const showSuggestions = suggestions.length > 0;
  const visibleRecentPlaces = keyboardSearchMode
    ? recentPlaces.slice(0, 4)
    : recentPlaces;
  const listData = showSuggestions
    ? suggestions.map((s) => ({ type: 'suggestion', ...s }))
    : visibleRecentPlaces.map((p) => ({ type: 'recent', ...p }));

  const activeSearchMode =
    keyboardSearchMode || showSuggestions || suggestionsLoading;

  // Shared value para el gesto de pan (worklet, no puede leer JS state).
  useEffect(() => {
    isSearchingSv.set(activeSearchMode ? 1 : 0);
  }, [activeSearchMode, isSearchingSv]);

  const layout = useMemo(
    () => computeSheetMetrics({
      layoutScreenH,
      topInset,
      bottomInset: safeBottom,
      keyboardHeight,
      keyboardSearchMode,
      confirmationMode: false,
      activeSearchMode,
      listItemCount: listData.length,
      suggestionsLoading,
      fontScale,
      tripReviewMode: false,
      stopCount: 0,
      sheetRatios,
    }),
    [
      layoutScreenH,
      topInset,
      safeBottom,
      keyboardHeight,
      keyboardSearchMode,
      activeSearchMode,
      listData.length,
      suggestionsLoading,
      fontScale,
      sheetRatios,
    ]
  );

  const {
    collapsedH,
    sheetBottomGap,
    sheetBottomCollapsed,
    sheetBottomExpanded,
    expandedSheetHeight,
    expandedSheetSizeStyle,
    dismissAnchor,
  } = layout;

  const sheetBottom = expanded ? sheetBottomExpanded : sheetBottomCollapsed;
  const dismissAnchorRef = useRef(dismissAnchor);
  dismissAnchorRef.current = dismissAnchor;

  useEffect(() => {
    dismissAnchorSv.value = dismissAnchor;
  }, [dismissAnchor, dismissAnchorSv]);

  const activeFieldRef = useRef(ACTIVE_FIELD.firstParada);
  const isDismissingRef = useRef(false);
  const pendingAutoReviewRef = useRef(false);
  const hadActiveTripRef = useRef(false);

  const scheduleRouteReview = useCallback(() => {
    pendingAutoReviewRef.current = true;
  }, []);
  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    const routeActive =
      !activeTripMode
      && paradasAreComplete
      && Number.isFinite(pickup?.lat)
      && Number.isFinite(pickup?.lng);
    onRoutePreviewChange?.({
      active: routeActive,
      pickup,
      paradas,
      fareEstimate,
    });
  }, [activeTripMode, paradasAreComplete, pickup, paradas, fareEstimate, onRoutePreviewChange]);

  useEffect(() => {
    if (!activeTripMode || !activeTrip) return;
    if (paradasAreComplete && Number.isFinite(pickup?.lat)) return;

    const pickupFromTrip = {
      address: getTripPickupDisplayAddress(activeTrip),
      lat: Number(activeTrip.origin_lat),
      lng: Number(activeTrip.origin_lng),
      placeId: null,
    };
    const destFromTrip = {
      address: getTripDestinationDisplayAddress(activeTrip),
      lat: Number(activeTrip.destination_lat),
      lng: Number(activeTrip.destination_lng),
      placeId: null,
    };

    if (
      Number.isFinite(pickupFromTrip.lat)
      && Number.isFinite(pickupFromTrip.lng)
      && Number.isFinite(destFromTrip.lat)
      && Number.isFinite(destFromTrip.lng)
    ) {
      setPickup(pickupFromTrip);
      setParadas([destFromTrip]);
    }
  }, [activeTripMode, activeTrip?.id, paradasAreComplete, pickup?.lat]);

  useEffect(() => {
    if (expanded) return;
    cancelAnimation(dragY);
    dragY.value = 0;
    isDismissingRef.current = false;
    dismissLayoutRef.current = null;
    setIsDismissing(false);
  }, [expanded, dragY]);

  useEffect(() => {
    if (!expanded || !paradasAreComplete || isEditingRoute) return undefined;
    Keyboard.dismiss();
    setKeyboardHeight(0);
    const timers = [
      setTimeout(() => setKeyboardHeight(0), 60),
      setTimeout(() => setKeyboardHeight(0), 200),
    ];
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [expanded, paradasAreComplete, isEditingRoute]);

  const loadPickupFromGPS = useCallback(async () => {
    // No sobreescribir el pickup del viaje activo con coordenadas GPS;
    // evita disparar el toast de cobertura mientras hay un viaje en curso.
    if (useTripStore.getState().activeTrip) return;

    setPickupLoading(true);
    let quickLoaded = false;

    try {
      // Fase 1: mostrar la última ubicación conocida de inmediato (sin esperar GPS)
      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })
        .catch(() => null);

      if (lastKnown) {
        const quickAddress = await reverseGeocode(
          lastKnown.coords.latitude,
          lastKnown.coords.longitude,
        ).catch(() => null);

        if (quickAddress) {
          setPickup({
            address: quickAddress,
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
            placeId: null,
          });
          setPickupLoading(false);
          quickLoaded = true;
        }
      }

      // Fase 2: obtener posición fresca y actualizar silenciosamente
      const loc = await getCurrentLocation();
      const address = await reverseGeocode(loc.latitude, loc.longitude);
      // Re-chequear por si un viaje fue creado mientras el GPS resolvía
      if (!useTripStore.getState().activeTrip) {
        setPickup({
          address,
          lat: loc.latitude,
          lng: loc.longitude,
          placeId: null,
        });
      }
    } catch {
      if (!quickLoaded) {
        Toast.show({ type: 'error', text1: 'No se pudo obtener tu ubicación' });
      }
    } finally {
      setPickupLoading(false);
    }
  }, [getCurrentLocation]);

  const refreshFrequentPlaces = useCallback(async () => {
    if (!profile?.phone) {
      setRecentPlaces([]);
      return;
    }
    const places = await loadFrequentPlaces(profile.phone, fetchTripHistory);
    setRecentPlaces(places);
  }, [profile?.phone, fetchTripHistory]);

  useEffect(() => {
    loadPickupFromGPS();
  }, [loadPickupFromGPS]);

  useEffect(() => {
    refreshFrequentPlaces();
  }, [refreshFrequentPlaces]);

  useEffect(() => {
    let cancelled = false;
    const pickupLat = pickup?.lat;
    const pickupLng = pickup?.lng;
    const destLat = finalParada?.lat;
    const destLng = finalParada?.lng;

    if (
      !Number.isFinite(pickupLat)
      || !Number.isFinite(pickupLng)
      || !Number.isFinite(destLat)
      || !Number.isFinite(destLng)
    ) {
      setFareEstimate(null);
      setFareLoading(false);
      return undefined;
    }

    if (!paradasAreComplete) {
      setFareEstimate(null);
      setFareLoading(false);
      return undefined;
    }

    setFareLoading(true);
    estimatePassengerTripFare(pickup, finalParada, intermediateWaypoints)
      .then((est) => {
        if (!cancelled) setFareEstimate(est);
      })
      .catch(() => {
        if (!cancelled) setFareEstimate(null);
      })
      .finally(() => {
        if (!cancelled) setFareLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    pickup,
    finalParada,
    pickup?.lat,
    pickup?.lng,
    finalParada?.lat,
    finalParada?.lng,
    intermediateWaypoints,
    paradasAreComplete,
  ]);

  const resetTripPlanning = useCallback(() => {
    pendingAutoReviewRef.current = false;
    setIsEditingRoute(false);
    setParadas([]);
    setFareEstimate(null);
    setStopSheet({ visible: false, index: 0 });
    setSuggestions([]);
    setSuggestionsLoading(false);
    setKeyboardHeight(0);
  }, []);

  useEffect(() => {
    if (tripStatus !== 'cancelled' || !activeTrip) return undefined;
    const timer = setTimeout(async () => {
      resetTripPlanning();
      await onActiveTripFinish?.();
    }, 1400);
    return () => clearTimeout(timer);
  }, [tripStatus, activeTrip, resetTripPlanning, onActiveTripFinish]);

  useEffect(() => {
    if (activeTrip) {
      hadActiveTripRef.current = true;
      return;
    }
    if (hadActiveTripRef.current) {
      hadActiveTripRef.current = false;
      resetTripPlanning();
    }
  }, [activeTrip?.id, resetTripPlanning]);

  const finishSheetMotion = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    isDismissingRef.current = false;
    dismissLayoutRef.current = null;
    setIsDismissing(false);
    cancelAnimation(dragY);
    dragY.value = 0;
    scrollY.value = 0;
    Keyboard.dismiss();
  }, [dragY, scrollY]);

  const minimizeSheet = useCallback(() => {
    finishSheetMotion();
    setIsEditingRoute(false);
    setExpanded(false);
  }, [finishSheetMotion]);

  const cancelTripPlanning = useCallback(() => {
    finishSheetMotion();
    setExpanded(false);
    resetTripPlanning();
  }, [finishSheetMotion, resetTripPlanning]);

  const animateMinimize = useCallback(() => {
    if (!expanded || isDismissingRef.current) return;
    isDismissingRef.current = true;
    dismissLayoutRef.current = {
      expandedSheetSizeStyle,
      sheetBottom: sheetBottomExpanded,
    };
    setIsDismissing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();

    const easing = Easing.out(Easing.cubic);
    const minimizeDistance = Math.min(
      Math.max(dragY.value + 56, 96),
      Math.round(layoutScreenH * 0.22)
    );

    dragY.value = withTiming(minimizeDistance, { duration: 240, easing }, (finished) => {
      if (finished) {
        runOnJS(minimizeSheet)();
      }
    });
  }, [
    expanded,
    dragY,
    minimizeSheet,
    expandedSheetSizeStyle,
    sheetBottomExpanded,
    layoutScreenH,
  ]);

  const handleExpand = useCallback((forEdit = false) => {
    pendingAutoReviewRef.current = false;
    setIsEditingRoute(forEdit);
    finishSheetMotion();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setKeyboardHeight(0);
    setSuggestions([]);
    setSuggestionsLoading(false);
    setExpanded(true);

    if (forEdit) {
      const destField = paradas.length > 1
        ? makeParadaField(paradas.length - 1)
        : ACTIVE_FIELD.firstParada;
      activeFieldRef.current = destField;
      setActiveField(destField);
      requestAnimationFrame(() => {
        firstParadaInputRef.current?.focus();
        setTimeout(() => firstParadaInputRef.current?.focus(), 120);
      });
    }
  }, [finishSheetMotion, paradas.length]);

  useEffect(() => {
    if (!pendingAutoReviewRef.current) return undefined;
    if (!paradasAreComplete) return undefined;
    if (!Number.isFinite(pickup?.lat) || !Number.isFinite(pickup?.lng)) return undefined;
    if (stopSheet.visible || mapPickerField != null) return undefined;

    pendingAutoReviewRef.current = false;
    const timer = setTimeout(() => {
      finishSheetMotion();
      setExpanded(false);
      setIsEditingRoute(false);
      Keyboard.dismiss();
      setSuggestions([]);
      setSuggestionsLoading(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, expanded ? 160 : 0);

    return () => clearTimeout(timer);
  }, [
    paradasAreComplete,
    pickup?.lat,
    pickup?.lng,
    expanded,
    stopSheet.visible,
    mapPickerField,
    finishSheetMotion,
    paradas,
  ]);

  const handleBackdropPress = useCallback(() => {
    animateMinimize();
  }, [animateMinimize]);

  const handleCancelTrip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cancelTripPlanning();
  }, [cancelTripPlanning]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const sheetPanGesture = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-28, 28])
    .onUpdate((event) => {
      // Bloquear dismiss mientras hay búsqueda activa de POIs o el listado tiene scroll.
      if (isSearchingSv.value === 1) return;
      if (scrollY.value > 2) return;
      if (event.translationY > 0) {
        dragY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (isSearchingSv.value === 1) {
        dragY.value = withSpring(0, { damping: 24, stiffness: 300, mass: 0.85 });
        return;
      }
      const shouldMinimize =
        dragY.value > DISMISS_DRAG_PX || event.velocityY > DISMISS_VELOCITY;
      if (shouldMinimize) {
        runOnJS(animateMinimize)();
      } else {
        dragY.value = withSpring(0, { damping: 24, stiffness: 300, mass: 0.85 });
      }
    });

  const blurAllRouteInputs = useCallback(() => {
    pickupInputRef.current?.blur();
    firstParadaInputRef.current?.blur();
  }, []);

  const dismissSearchKeyboard = useCallback(() => {
    setSuggestions([]);
    setSuggestionsLoading(false);
    Keyboard.dismiss();
    blurAllRouteInputs();
  }, [blurAllRouteInputs]);

  const scrollFieldToStart = useCallback((field) => {
    let inputRef = firstParadaInputRef;
    if (field === ACTIVE_FIELD.pickup) {
      inputRef = pickupInputRef;
    }
    requestAnimationFrame(() => {
      inputRef.current?.scrollToStart?.();
      setTimeout(() => inputRef.current?.scrollToStart?.(), 80);
      setTimeout(() => inputRef.current?.scrollToStart?.(), 200);
    });
  }, []);

  const focusFirstParadaInput = useCallback(() => {
    activeFieldRef.current = ACTIVE_FIELD.firstParada;
    setActiveField(ACTIVE_FIELD.firstParada);
    setSuggestions([]);
    setSuggestionsLoading(false);
    pickupInputRef.current?.blur();
    requestAnimationFrame(() => {
      firstParadaInputRef.current?.focus();
      setTimeout(() => firstParadaInputRef.current?.focus(), 60);
    });
  }, []);

  const handleFirstParadaSelect = useCallback(
    async (place) => {
      setParadas([place]);
      scrollFieldToStart(ACTIVE_FIELD.firstParada);
      if (Number.isFinite(place?.lat) && Number.isFinite(place?.lng)) {
        dismissSearchKeyboard();
        scheduleRouteReview();
        await addRecentPlace(profile?.phone, place);
        await refreshFrequentPlaces();
      }
    },
    [dismissSearchKeyboard, profile?.phone, refreshFrequentPlaces, scrollFieldToStart, scheduleRouteReview]
  );

  const handleLastParadaSelect = useCallback(
    async (place) => {
      if (!place) {
        if (isEditingRoute && paradas.length === 1) {
          setParadas([{ address: '', lat: null, lng: null, placeId: null }]);
          return;
        }
        setParadas((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1)));
        return;
      }
      setParadas((prev) => {
        if (prev.length === 0) return [place];
        const next = [...prev];
        next[next.length - 1] = place;
        return next;
      });
      scrollFieldToStart(makeParadaField(Math.max(0, paradas.length - 1)));
      if (Number.isFinite(place?.lat) && Number.isFinite(place?.lng)) {
        dismissSearchKeyboard();
        scheduleRouteReview();
        await addRecentPlace(profile?.phone, place);
        await refreshFrequentPlaces();
      }
    },
    [dismissSearchKeyboard, isEditingRoute, profile?.phone, refreshFrequentPlaces, scrollFieldToStart, paradas.length, scheduleRouteReview]
  );

  const handleSuggestionSelect = useCallback(
    async (suggestion, field) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSuggestions([]);

      let place;
      try {
        place = await resolvePlaceFromSuggestion(suggestion);
      } catch {
        place = {
          address: suggestion.address,
          lat: Number.isFinite(suggestion.lat) ? suggestion.lat : null,
          lng: Number.isFinite(suggestion.lng) ? suggestion.lng : null,
          placeId: suggestion.placeId,
        };
      }

      if (field === ACTIVE_FIELD.pickup) {
        setPickup(place);
        scrollFieldToStart(ACTIVE_FIELD.pickup);
        if (paradas.length === 0) {
          focusFirstParadaInput();
        }
      } else if (paradas.length === 0) {
        setParadas([place]);
        scrollFieldToStart(ACTIVE_FIELD.firstParada);
        if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
          dismissSearchKeyboard();
          scheduleRouteReview();
        }
        await addRecentPlace(profile?.phone, place);
        await refreshFrequentPlaces();
      } else {
        setParadas((prev) => {
          if (prev.length === 0) return [place];
          const next = [...prev];
          next[next.length - 1] = place;
          return next;
        });
        scrollFieldToStart(makeParadaField(Math.max(0, paradas.length - 1)));
        if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
          dismissSearchKeyboard();
          scheduleRouteReview();
        }
        await addRecentPlace(profile?.phone, place);
        await refreshFrequentPlaces();
      }
    },
    [dismissSearchKeyboard, profile?.phone, refreshFrequentPlaces, scrollFieldToStart, focusFirstParadaInput, paradas.length, scheduleRouteReview]
  );

  const handleRecentSelect = useCallback(
    async (place) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const full = {
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        placeId: place.placeId,
      };
      if (paradas.length === 0) {
        setParadas([full]);
        scrollFieldToStart(ACTIVE_FIELD.firstParada);
      } else {
        setParadas((prev) => {
          const next = [...prev];
          next[next.length - 1] = full;
          return next;
        });
        scrollFieldToStart(makeParadaField(Math.max(0, paradas.length - 1)));
      }
      if (Number.isFinite(full.lat) && Number.isFinite(full.lng)) {
        dismissSearchKeyboard();
        scheduleRouteReview();
      }
      await addRecentPlace(profile?.phone, full);
      await refreshFrequentPlaces();
    },
    [dismissSearchKeyboard, profile?.phone, refreshFrequentPlaces, scrollFieldToStart, paradas.length, scheduleRouteReview]
  );

  const submitTrip = useCallback(async () => {
    const coverage = validatePickupForTrip(pickup?.lat, pickup?.lng);
    if (!coverage.allowed) {
      notifyPickupOutsideCoverage();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Keyboard.dismiss();

    const durationMinutes = fareEstimate?.durationText
      ? Number.parseInt(String(fareEstimate.durationText).replace(/\D/g, ''), 10)
      : null;

    const result = await requestTrip({
      pickupAddress: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupPlaceId: pickup.placeId,
      destinationAddress: finalParada.address,
      destinationLat: finalParada.lat,
      destinationLng: finalParada.lng,
      destinationPlaceId: finalParada.placeId || null,
      waypoints: intermediateWaypoints.map((parada) => ({
        address: parada.address,
        lat: parada.lat,
        lng: parada.lng,
        placeId: parada.placeId || null,
      })),
      estimatedPrice: fareEstimate?.price ?? null,
      distanceKm: fareEstimate?.distanceKm ?? null,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
      passengerName: profile?.name || 'Pasajero',
      passengerPhone: profile?.phone || null,
      notes: null,
    });

    if (result.ok) {
      finishSheetMotion();
      setExpanded(false);
      setIsEditingRoute(false);
      Keyboard.dismiss();
      setSuggestions([]);
      setSuggestionsLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onTripCreated?.(result.trip);
    } else {
      Toast.show({
        type: 'error',
        text1: 'No se pudo solicitar el viaje',
        text2: result.error || 'Intentá de nuevo.',
      });
    }
  }, [pickup, finalParada, intermediateWaypoints, profile, fareEstimate, requestTrip, finishSheetMotion, onTripCreated, validatePickupForTrip, notifyPickupOutsideCoverage]);

  const handleConfirm = useCallback(() => {
    if (!pickup?.address || !Number.isFinite(pickup?.lat)) {
      Toast.show({
        type: 'error',
        text1: 'Definí dónde te buscamos',
        text2: 'Elegí una dirección de recogida del listado.',
      });
      return;
    }

    if (pickupOutsideCoverage) {
      notifyPickupOutsideCoverage();
      return;
    }

    if (!paradasAreComplete || !finalParada?.address) {
      Toast.show({
        type: 'error',
        text1: 'Elegí al menos una parada',
        text2: 'Seleccioná las direcciones del listado de sugerencias.',
      });
      return;
    }

    if (isCreating) return;

    submitTrip();
  }, [pickup, paradas, finalParada, paradasAreComplete, isCreating, submitTrip, pickupOutsideCoverage, notifyPickupOutsideCoverage]);

  const sheetDragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, dragY.value) }],
  }));

  const backdropDragStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      dragY.value,
      [0, dismissAnchorSv.value * 0.22, dismissAnchorSv.value * 0.5],
      [1, 0.55, 0],
      Extrapolation.CLAMP
    ),
  }));

  const { reviewSheetH, routeStopsMaxHeight, needsRouteScroll } = reviewMetrics;
  const sheetIsOpen = expanded || isDismissing;
  const sheetSizeStyle = sheetIsOpen
    ? (isDismissing && dismissLayoutRef.current
      ? dismissLayoutRef.current.expandedSheetSizeStyle
      : expandedSheetSizeStyle)
    : activeTripMode
      ? {
        maxHeight: activeTripSheetH,
      }
      : routeReviewVisible
        ? {
          height: reviewSheetH,
          maxHeight: reviewSheetH,
        }
        : {
          height: collapsedH,
        };
  const sheetBottomStyle = sheetIsOpen
    ? (isDismissing && dismissLayoutRef.current
      ? dismissLayoutRef.current.sheetBottom
      : sheetBottom)
    : sheetBottomCollapsed;

  const canSubmit =
    !!pickup?.address
    && Number.isFinite(pickup?.lat)
    && paradasAreComplete
    && !pickupOutsideCoverage
    && !isCreating;

  const handlePickupSuggestionsChange = useCallback((items, meta) => {
    if (!meta.isFocused && activeFieldRef.current !== ACTIVE_FIELD.pickup) return;
    activeFieldRef.current = ACTIVE_FIELD.pickup;
    setActiveField(ACTIVE_FIELD.pickup);
    setSuggestions(items);
    setSuggestionsLoading(meta.isSearching);
  }, []);

  const handleFirstParadaSuggestionsChange = useCallback((items, meta) => {
    if (!meta.isFocused && activeFieldRef.current !== ACTIVE_FIELD.firstParada) return;
    activeFieldRef.current = ACTIVE_FIELD.firstParada;
    setActiveField(ACTIVE_FIELD.firstParada);
    setSuggestions(items);
    setSuggestionsLoading(meta.isSearching);
  }, []);

  const handleLastParadaSuggestionsChange = useCallback((items, meta) => {
    const lastField = makeParadaField(Math.max(0, paradas.length - 1));
    if (
      !meta.isFocused
      && activeFieldRef.current !== lastField
      && activeFieldRef.current !== ACTIVE_FIELD.firstParada
    ) {
      return;
    }
    activeFieldRef.current = lastField;
    setActiveField(lastField);
    setSuggestions(items);
    setSuggestionsLoading(meta.isSearching);
  }, [paradas.length]);

  const handleLastParadaFocus = useCallback((focused) => {
    if (!focused) return;
    const lastField = makeParadaField(Math.max(0, paradas.length - 1));
    activeFieldRef.current = lastField;
    setActiveField(lastField);
  }, [paradas.length]);

  const openStopSheet = useCallback((index) => {
    dismissSearchKeyboard();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStopSheet({ visible: true, index });
  }, [dismissSearchKeyboard]);

  const handlePressAddParada = useCallback(() => {
    if (paradas.length >= MAX_PARADAS) {
      Toast.show({
        type: 'info',
        text1: 'Máximo de paradas',
        text2: `Podés agregar hasta ${MAX_PARADAS} paradas.`,
      });
      return;
    }
    openStopSheet(paradas.length);
  }, [paradas.length, openStopSheet]);

  const handlePressParada = useCallback((index) => {
    openStopSheet(index);
  }, [openStopSheet]);

  const handleStopSheetClose = useCallback(() => {
    setStopSheet({ visible: false, index: 0 });
  }, []);

  const handleStopSheetSelect = useCallback(async (place, index) => {
    if (!place?.address) return;
    setParadas((prev) => {
      const next = [...prev];
      if (index < next.length) {
        next[index] = place;
      } else {
        next.push(place);
      }
      return next;
    });
    setStopSheet({ visible: false, index: 0 });
    if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
      scheduleRouteReview();
      await addRecentPlace(profile?.phone, place);
      await refreshFrequentPlaces();
    }
  }, [profile?.phone, refreshFrequentPlaces, scheduleRouteReview]);

  const handleRemoveParada = useCallback((index) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setParadas((prev) => prev.filter((_, idx) => idx !== index));
    setSuggestions([]);
  }, []);

  const handleMoveParadaUp = useCallback((index) => {
    if (index <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setParadas((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const handleMoveParadaDown = useCallback((index) => {
    setParadas((prev) => {
      if (index >= prev.length - 1) return prev;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const handlePickupFocus = useCallback((focused) => {
    if (!focused) return;
    activeFieldRef.current = ACTIVE_FIELD.pickup;
    setActiveField(ACTIVE_FIELD.pickup);
  }, []);

  const handleFirstParadaFocus = useCallback((focused) => {
    if (!focused) return;
    activeFieldRef.current = ACTIVE_FIELD.firstParada;
    setActiveField(ACTIVE_FIELD.firstParada);
  }, []);

  const openMapPicker = useCallback(
    (field) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      dismissSearchKeyboard();
      activeFieldRef.current = field;
      setActiveField(field);
      setMapPickerField(field);
    },
    [dismissSearchKeyboard]
  );

  const handleMapPickerConfirm = useCallback(
    async (place) => {
      if (mapPickerField === ACTIVE_FIELD.pickup) {
        setPickup(place);
        scrollFieldToStart(ACTIVE_FIELD.pickup);
        if (paradas.length === 0) {
          focusFirstParadaInput();
        }
      } else if (isParadaField(mapPickerField)) {
        const paradaIndex = paradaIndexFromField(mapPickerField);
        setParadas((prev) => {
          const next = [...prev];
          if (paradaIndex < next.length) {
            next[paradaIndex] = place;
          } else {
            next.push(place);
          }
          return next;
        });
        if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
          dismissSearchKeyboard();
          scheduleRouteReview();
          await addRecentPlace(profile?.phone, place);
          await refreshFrequentPlaces();
        }
      } else if (paradas.length === 0) {
        setParadas([place]);
        scrollFieldToStart(ACTIVE_FIELD.firstParada);
        if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
          dismissSearchKeyboard();
          scheduleRouteReview();
          await addRecentPlace(profile?.phone, place);
          await refreshFrequentPlaces();
        }
      } else {
        setParadas((prev) => {
          const next = [...prev];
          next[next.length - 1] = place;
          return next;
        });
        if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
          dismissSearchKeyboard();
          scheduleRouteReview();
          await addRecentPlace(profile?.phone, place);
          await refreshFrequentPlaces();
        }
      }
      setMapPickerField(null);
    },
    [mapPickerField, dismissSearchKeyboard, profile?.phone, refreshFrequentPlaces, scrollFieldToStart, focusFirstParadaInput, paradas.length, scheduleRouteReview]
  );

  const mapPickerInitialCoordinate = (() => {
    if (!mapPickerField) return null;
    let current = finalParada;
    if (mapPickerField === ACTIVE_FIELD.pickup) {
      current = pickup;
    } else if (isParadaField(mapPickerField)) {
      current = paradas[paradaIndexFromField(mapPickerField)];
    }
    if (Number.isFinite(current?.lat) && Number.isFinite(current?.lng)) {
      return { latitude: current.lat, longitude: current.lng };
    }
    if (Number.isFinite(pickup?.lat) && Number.isFinite(pickup?.lng)) {
      return { latitude: pickup.lat, longitude: pickup.lng };
    }
    return null;
  })();

  const compactSearchLayout = activeSearchMode;
  const showFrequentLabel =
    !activeSearchMode && recentPlaces.length > 0 && (paradas.length === 0 || isEditingRoute);
  const showSheetFooter = sheetIsOpen;

  useEffect(() => {
    const collapsedSheetH = activeTripMode
      ? activeTripSheetH
      : routeReviewVisible
        ? reviewSheetH
        : collapsedH;
    const totalBottom = expanded
      ? sheetBottomExpanded + expandedSheetHeight
      : sheetBottomCollapsed + collapsedSheetH;
    onSheetLayout?.(totalBottom, expanded || activeTripMode);
  }, [
    expanded,
    activeTripMode,
    sheetBottomExpanded,
    sheetBottomCollapsed,
    expandedSheetHeight,
    collapsedH,
    reviewSheetH,
    activeTripSheetH,
    routeReviewVisible,
    paradas.length,
    onSheetLayout,
  ]);

  const routeInputsSection = (
    <View style={styles.routeSection}>
      <TripRouteInputs
        pickupInputRef={pickupInputRef}
        firstParadaInputRef={firstParadaInputRef}
        pickup={pickup}
        paradas={paradas}
        pickupLoading={pickupLoading}
        pickupCoverageWarning={pickupOutsideCoverage}
        compactLayout={compactSearchLayout}
        canAddParada={paradas.length < MAX_PARADAS}
        onPickupSelect={setPickup}
        onFirstParadaSelect={handleFirstParadaSelect}
        onLastParadaSelect={handleLastParadaSelect}
        onPickupGPS={loadPickupFromGPS}
        onPickupMap={() => openMapPicker(ACTIVE_FIELD.pickup)}
        onFirstParadaMap={() => openMapPicker(ACTIVE_FIELD.firstParada)}
        onLastParadaMap={() => openMapPicker(makeParadaField(Math.max(0, paradas.length - 1)))}
        onPickupFocus={handlePickupFocus}
        onFirstParadaFocus={handleFirstParadaFocus}
        onLastParadaFocus={handleLastParadaFocus}
        onPickupSuggestionsChange={handlePickupSuggestionsChange}
        onFirstParadaSuggestionsChange={handleFirstParadaSuggestionsChange}
        onLastParadaSuggestionsChange={handleLastParadaSuggestionsChange}
        onPressAddParada={handlePressAddParada}
        onPressParada={handlePressParada}
        onRemoveParada={handleRemoveParada}
        onMoveParadaUp={handleMoveParadaUp}
        onMoveParadaDown={handleMoveParadaDown}
      />
    </View>
  );

  const routeStopsContent = (
    <>
      <View style={[styles.reviewRouteStop, { minHeight: reviewUi.stopMinHeight }]}>
        <View
          style={[
            styles.reviewRouteDot,
            styles.reviewRouteDotPickup,
            {
              width: reviewUi.dotSize,
              height: reviewUi.dotSize,
              borderRadius: reviewUi.dotSize / 2,
            },
          ]}
        />
        <View style={styles.reviewRouteStopTextCol}>
          <Text style={[styles.reviewRouteStopLabel, { fontSize: reviewUi.routeTextSize - 2 }]}>
            Recogida
          </Text>
          <Text
            style={[styles.reviewRouteStopText, { fontSize: reviewUi.routeTextSize }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.2}
          >
            {pickup?.address?.split(',')[0] || 'Punto de retiro'}
          </Text>
        </View>
      </View>
      {paradas.map((parada, index) => {
        const isFinal = index === paradas.length - 1;
        const hasIntermediateStops = paradas.length > 1;
        const stopLabel = isFinal
          ? (hasIntermediateStops ? 'Destino final' : 'Destino')
          : `Parada ${index + 1}`;
        return (
        <View
          key={`review-route-${index}`}
          style={[styles.reviewRouteStop, { minHeight: reviewUi.stopMinHeight }]}
        >
          <View
            style={[
              styles.reviewRouteDot,
              isFinal
                ? styles.reviewRouteDotDest
                : styles.reviewRouteDotStop,
              {
                width: reviewUi.dotSize,
                height: reviewUi.dotSize,
                borderRadius: isFinal ? 2 : reviewUi.dotSize / 2,
              },
            ]}
          />
          <View style={styles.reviewRouteStopTextCol}>
            <Text style={[styles.reviewRouteStopLabel, { fontSize: reviewUi.routeTextSize - 2 }]}>
              {stopLabel}
            </Text>
            <Text
              style={[styles.reviewRouteStopText, { fontSize: reviewUi.routeTextSize }]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.2}
            >
              {parada?.address?.split(',')[0] || stopLabel}
            </Text>
          </View>
        </View>
        );
      })}
    </>
  );

  const routeReviewSection = (
    <View style={styles.reviewSheet}>
      <View style={styles.reviewSheetHandleWrap}>
        <View style={styles.dragHandle} />
      </View>

      <Pressable
        onPress={() => handleExpand(true)}
        style={({ pressed }) => [
          styles.reviewRouteCard,
          needsRouteScroll && styles.reviewRouteCardCompact,
          pressed && styles.reviewRouteCardPressed,
        ]}
        accessibilityLabel="Editar direcciones del viaje"
      >
        {needsRouteScroll ? (
          <ScrollView
            style={[
              styles.reviewRouteScroll,
              routeStopsMaxHeight != null && { maxHeight: routeStopsMaxHeight },
            ]}
            contentContainerStyle={styles.reviewRouteScrollContent}
            nestedScrollEnabled
            scrollEnabled
            showsVerticalScrollIndicator
            bounces={false}
          >
            {routeStopsContent}
          </ScrollView>
        ) : (
          routeStopsContent
        )}
        <View style={[styles.reviewRouteEditRow, { minHeight: reviewUi.editRowMinHeight }]}>
          <Ionicons name="create-outline" size={reviewUi.editIconSize} color={colors.primary} />
          <Text
            style={[styles.reviewRouteEditHint, { fontSize: reviewUi.editHintSize }]}
            maxFontSizeMultiplier={1.2}
          >
            Tocá para editar
          </Text>
          <Ionicons name="chevron-forward" size={reviewUi.chevronSize} color={colors.textMuted} />
        </View>
      </Pressable>

      {fareLoading ? (
        <View style={styles.reviewFareRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text
            style={[styles.reviewFareLoading, { fontSize: reviewUi.fareLoadingSize }]}
            maxFontSizeMultiplier={1.2}
          >
            Calculando precio...
          </Text>
        </View>
      ) : (
        <View style={styles.reviewFareRow}>
          <View style={styles.reviewFareMain}>
            <Text
              style={[styles.reviewFareLabel, { fontSize: reviewUi.fareLabelSize }]}
              maxFontSizeMultiplier={1.15}
            >
              Precio del viaje
            </Text>
            <Text
              style={[styles.reviewFarePrice, { fontSize: reviewUi.farePriceSize }]}
              maxFontSizeMultiplier={1.15}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {fareEstimate?.price != null ? formatArs(fareEstimate.price) : '—'}
            </Text>
          </View>
          {fareEstimate?.distanceText || fareEstimate?.durationText ? (
            <Text
              style={[styles.reviewFareMeta, { fontSize: reviewUi.fareMetaSize }]}
              maxFontSizeMultiplier={1.15}
              numberOfLines={2}
            >
              {[fareEstimate.distanceText, fareEstimate.durationText].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      )}

      <PickupCoverageBanner visible={pickupOutsideCoverage} />

      <Pressable
        onPress={handleConfirm}
        disabled={!canSubmit}
        style={({ pressed }) => [
          styles.confirmBtn,
          styles.reviewConfirmBtn,
          !canSubmit && styles.confirmBtnDisabled,
          pressed && canSubmit && { opacity: 0.94 },
        ]}
      >
        <LinearGradient
          colors={canSubmit ? colors.gradient.brand : ['#D8DEE8', '#C8D0DC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.reviewConfirmBtnGrad, { minHeight: reviewUi.confirmBtnHeight }]}
        >
          {isCreating ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="car-sport" size={reviewUi.confirmIconSize} color="#FFFFFF" />
              <Text
                style={[styles.reviewConfirmBtnText, { fontSize: reviewUi.confirmTextSize }]}
                maxFontSizeMultiplier={1.15}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {fareEstimate?.price != null
                  ? `Confirmar · ${formatArs(fareEstimate.price)}`
                  : 'Confirmar viaje'}
              </Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  );

  const renderListItem = ({ item }) => {
    if (item.type === 'suggestion') {
      return (
        <Pressable
          onPress={() => handleSuggestionSelect(item, activeField)}
          style={({ pressed }) => [
            styles.listItem,
            styles.listItemSuggestion,
            pressed && styles.listItemPressed,
          ]}
        >
          <View style={styles.listIcon}>
            <Ionicons name="location" size={16} color={colors.accent} />
          </View>
          <View style={styles.listTextCol}>
            <Text style={styles.listTitle} numberOfLines={1}>
              {item.title || item.address.split(',')[0]}
            </Text>
            {item.subtitle ? (
              <Text style={styles.listSubtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : (
              <Text style={styles.listSubtitle} numberOfLines={1}>
                {item.address.split(',').slice(1).join(',').trim()}
              </Text>
            )}
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable
        onPress={() => handleRecentSelect(item)}
        style={({ pressed }) => [styles.listItem, pressed && styles.listItemPressed]}
      >
        <View style={styles.listIcon}>
          <Ionicons
            name={item.visitCount > 0 ? 'star' : 'time'}
            size={16}
            color={item.visitCount > 0 ? colors.warning : colors.primaryLight}
          />
        </View>
        <View style={styles.listTextCol}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {item.title || item.address.split(',')[0]}
          </Text>
          <Text style={styles.listSubtitle} numberOfLines={1}>
            {item.visitCount > 0
              ? `${item.visitCount} ${item.visitCount === 1 ? 'viaje' : 'viajes'} · ${item.address}`
              : item.address}
          </Text>
        </View>
      </Pressable>
    );
  };

  const resultsListBody = (
    <>
      {showFrequentLabel ? (
        <Text style={styles.sectionLabel}>Destinos frecuentes</Text>
      ) : null}
      {suggestionsLoading ? (
        <View style={styles.loadingRowCompact}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Buscando direcciones...</Text>
        </View>
      ) : null}
      {listData.length === 0 && !showSuggestions && !suggestionsLoading && paradas.length === 0 ? (
        <View style={styles.emptyHint}>
          <Ionicons name="search-outline" size={28} color={colors.accentLight} />
          <Text style={styles.hintText}>
            Escribí al menos 2 letras para ver direcciones en Salta.
          </Text>
        </View>
      ) : null}
      {listData.map((item, i) => (
        <View key={item.placeId || item.address || `r-${i}`}>
          {renderListItem({ item })}
        </View>
      ))}
    </>
  );

  return (
    <>
      {sheetIsOpen ? (
        <Animated.View style={[styles.backdrop, backdropDragStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleBackdropPress}
            accessibilityLabel="Minimizar planificador de viaje"
          />
        </Animated.View>
      ) : null}

      <GestureDetector gesture={sheetIsOpen ? sheetPanGesture : Gesture.Pan().enabled(false)}>
        <Animated.View
          style={[
            styles.sheet,
            shadow.float,
            {
              bottom: sheetBottomStyle,
              left: isLandscape
                ? Math.max(sheetHMargin, (screenW - Math.min(screenW - sheetHMargin * 2, contentMaxWidth)) / 2)
                : sheetHMargin,
              width: isLandscape
                ? Math.min(screenW - sheetHMargin * 2, contentMaxWidth)
                : screenW - sheetHMargin * 2,
            },
            sheetSizeStyle,
            sheetIsOpen ? sheetDragStyle : null,
          ]}
        >
        <LinearGradient
          colors={['#FFFFFF', colors.accentSoft]}
          style={styles.sheetGradient}
        >
          <View
            style={[
              styles.sheetInner,
              !sheetIsOpen && styles.sheetInnerCollapsed,
              sheetIsOpen && styles.sheetInnerExpanded,
              (routeReviewVisible || activeTripMode) && styles.sheetInnerReview,
              activeTripMode && styles.sheetInnerActiveTrip,
            ]}
          >
            {activeTripMode && activeTripUi ? (
              <TripActiveSheet {...activeTripUi} />
            ) : routeReviewVisible ? (
              routeReviewSection
            ) : !sheetIsOpen ? (
              <Pressable
                onPress={handleExpand}
                style={({ pressed }) => [styles.collapsedPill, pressed && { opacity: 0.96 }]}
              >
                <LinearGradient
                  colors={colors.gradient.primary}
                  style={styles.collapsedIcon}
                >
                  <Ionicons name="search" size={22} color="#FFFFFF" />
                </LinearGradient>
                <View style={styles.collapsedText}>
                  <Text style={styles.collapsedTitle}>¿A dónde vas?</Text>
                  <Text style={styles.collapsedSub}>Tocá para planificar tu viaje</Text>
                </View>
                <View style={styles.chevronCircle}>
                  <Ionicons name="chevron-up" size={18} color={colors.primary} />
                </View>
              </Pressable>
            ) : (
              <View style={styles.expandedBody}>
                <View
                  style={[
                    styles.sheetHeader,
                    compactSearchLayout && styles.sheetHeaderCompact,
                  ]}
                >
                  <View style={styles.dragHandle} />
                </View>

                <View style={styles.routeHeaderFixed}>
                  {routeInputsSection}
                </View>

                <Animated.ScrollView
                  style={styles.resultsList}
                  contentContainerStyle={[
                    styles.resultsListContent,
                    showSheetFooter && styles.resultsListContentWithFooter,
                  ]}
                  keyboardShouldPersistTaps="always"
                  keyboardDismissMode={activeSearchMode ? 'none' : 'on-drag'}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  onScroll={scrollHandler}
                  scrollEventThrottle={16}
                  bounces
                  overScrollMode="always"
                >
                  {resultsListBody}
                </Animated.ScrollView>

                {showSheetFooter ? (
                  <View style={styles.sheetFooterBrowse}>
                    <Pressable
                      onPress={handleCancelTrip}
                      style={({ pressed }) => [
                        styles.cancelBtn,
                        pressed && styles.cancelBtnPressed,
                      ]}
                    >
                      <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </LinearGradient>
        </Animated.View>
      </GestureDetector>

      <MapPinPickerModal
        visible={mapPickerField != null}
        fieldType={mapPickerField || 'destination'}
        initialCoordinate={mapPickerInitialCoordinate}
        onConfirm={handleMapPickerConfirm}
        onClose={() => setMapPickerField(null)}
      />

      <StopDestinationSheet
        visible={stopSheet.visible}
        stopIndex={stopSheet.index}
        initialPlace={paradas[stopSheet.index] || null}
        recentPlaces={recentPlaces}
        onSelect={handleStopSheetSelect}
        onClose={handleStopSheetClose}
        onMapPress={() => {
          const idx = stopSheet.index;
          setStopSheet({ visible: false, index: idx });
          openMapPicker(makeParadaField(idx));
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayLight,
    zIndex: 8,
  },
  sheet: {
    position: 'absolute',
    zIndex: 12,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sheetGradient: { flex: 1 },
  sheetInner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  sheetInnerCollapsed: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    justifyContent: 'center',
  },
  sheetInnerExpanded: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sheetInnerConfirmation: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheetInnerReview: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sheetInnerActiveTrip: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },

  collapsedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  collapsedIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedText: { flex: 1, alignItems: 'flex-start' },
  collapsedTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: -0.3,
  },
  collapsedSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 2,
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSheet: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 0,
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  reviewSheetHandleWrap: {
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  reviewRouteCard: {
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  reviewRouteCardPressed: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
  reviewRouteCardCompact: {
    flexShrink: 1,
    minHeight: 0,
  },
  reviewRouteScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  reviewRouteScrollContent: {
    gap: spacing.sm,
  },
  reviewRouteStop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  reviewRouteDot: {
    flexShrink: 0,
    marginTop: 14,
  },
  reviewRouteDotPickup: {
    backgroundColor: colors.accentLight,
  },
  reviewRouteDotStop: {
    backgroundColor: colors.warning,
  },
  reviewRouteDotDest: {
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  reviewRouteStopTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  reviewRouteStopLabel: {
    fontFamily: 'Inter_700Bold',
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    lineHeight: 16,
  },
  reviewRouteStopText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    lineHeight: 18,
  },
  reviewRouteEditRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  reviewRouteEditHint: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: colors.primary,
  },
  reviewFareRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentMuted,
  },
  reviewFareMain: {
    flexShrink: 1,
  },
  reviewFareLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  reviewFarePrice: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: -0.3,
    marginTop: 1,
  },
  reviewFareMeta: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
    flexShrink: 0,
  },
  reviewFareLoading: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
  },
  reviewConfirmBtn: {
    flexShrink: 0,
  },
  reviewConfirmBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  reviewConfirmBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  expandedBody: {
    flex: 1,
    height: '100%',
  },
  expandedFlex: { flex: 1 },
  routeSection: {
    flexShrink: 0,
  },
  routeSectionConfirmation: {
    marginBottom: spacing.sm,
  },
  routeHeaderFixed: {
    flexShrink: 0,
    zIndex: 2,
  },
  confirmationScrollFill: {
    flex: 1,
    minHeight: 0,
  },
  confirmationScrollContent: {
    paddingBottom: spacing.sm,
  },
  confirmationScrollContentComfort: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  sheetHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    minHeight: 28,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  sheetHeaderConfirmation: {
    minHeight: 32,
    marginBottom: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sheetHeaderCompact: {
    minHeight: 24,
    marginBottom: spacing.xs,
    paddingTop: 0,
    paddingBottom: spacing.xs,
  },
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  routeDotCol: {
    width: 14,
    paddingTop: 32,
    alignItems: 'center',
  },
  routeInputCol: {
    flex: 1,
    minWidth: 0,
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentLight,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  dotDest: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
    marginLeft: 22,
  },
  fareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  fareCardConfirmation: {
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  fareIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fareTextCol: { flex: 1 },
  fareLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  farePrice: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    marginTop: 2,
    letterSpacing: -0.5,
  },
  fareMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 2,
  },
  fareLoadingText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loadingRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: colors.primaryLight,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  resultsList: { flex: 1, minHeight: 0 },
  resultsListContent: { paddingBottom: spacing.md },
  resultsListContentWithFooter: { paddingBottom: spacing.xs },
  resultsListContentGrow: { flexGrow: 1 },
  sheetFooterBrowse: {
    flexShrink: 0,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: 'transparent',
  },
  sheetFooter: {
    flexShrink: 0,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: 'transparent',
  },
  sheetFooterConfirmation: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 0,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  listItemSuggestion: {
    paddingVertical: spacing.sm,
  },
  listItemPressed: { backgroundColor: colors.accentMuted },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTextCol: { flex: 1 },
  listTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    lineHeight: 19,
  },
  listSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyHint: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  hintText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
  },

  confirmBtn: { borderRadius: radius.md, overflow: 'hidden' },
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
    letterSpacing: 0.2,
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  cancelBtnPressed: {
    backgroundColor: colors.accentSoft,
    opacity: 0.92,
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryLight,
    letterSpacing: 0.1,
  },
});
