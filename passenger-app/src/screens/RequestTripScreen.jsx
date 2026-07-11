import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { colors } from '../theme/colors';
import { useAuthStore } from '../stores/authStore';
import { useLocation } from '../hooks/useLocation';
import { useTrip } from '../hooks/useTrip';
import { useServiceZoneCoverage } from '../hooks/useServiceZoneCoverage';
import { useTripStore } from '../stores/tripStore';
import { reverseGeocode, isCoordinateFallbackText } from '../services/googleMaps';
import AddressSearchInput from '../components/ui/AddressSearchInput';
import PickupCoverageBanner from '../components/ui/PickupCoverageBanner';
import MapPinPickerModal from '../components/map/MapPinPickerModal';
import { useResponsive } from '../hooks/useResponsive';
import { CONTENT_MAX_WIDTH } from '../utils/responsive';

export default function RequestTripScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { screenPadding, isTablet, isLandscape } = useResponsive();
  const contentMaxW = (isTablet || isLandscape) ? CONTENT_MAX_WIDTH : undefined;
  const { profile } = useAuthStore();
  const { location, getCurrentLocation } = useLocation();
  const { requestTrip } = useTrip();
  const { isCreating } = useTripStore();

  const [pickup, setPickup] = useState(route.params?.pickup ?? null);
  const [destination, setDestination] = useState(route.params?.destination ?? null);
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [mapPickerField, setMapPickerField] = useState(null);
  const {
    pickupOutsideCoverage,
    validatePickupForTrip,
    notifyPickupOutsideCoverage,
  } = useServiceZoneCoverage(pickup);

  useEffect(() => {
    if (route.params?.pickup) setPickup(route.params.pickup);
    if (route.params?.destination) setDestination(route.params.destination);
  }, [route.params?.pickup, route.params?.destination]);

  const handleUseGPS = useCallback(async () => {
    setGpsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const loc = await getCurrentLocation();
      let address = await reverseGeocode(loc.latitude, loc.longitude);
      if (isCoordinateFallbackText(address)) {
        const retry = await reverseGeocode(loc.latitude, loc.longitude);
        if (!isCoordinateFallbackText(retry)) address = retry;
      }
      setPickup({
        address,
        lat: loc.latitude,
        lng: loc.longitude,
        placeId: null,
      });
      Toast.show({
        type: 'success',
        text1: 'Ubicación obtenida',
        text2: address,
        visibilityTime: 2000,
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'No se pudo obtener tu ubicación' });
    } finally {
      setGpsLoading(false);
    }
  }, [getCurrentLocation]);

  const openMapPicker = useCallback((field) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMapPickerField(field);
  }, []);

  const handleMapPickerConfirm = useCallback((place) => {
    if (mapPickerField === 'pickup') {
      setPickup(place);
    } else {
      setDestination(place);
    }
    setMapPickerField(null);
  }, [mapPickerField]);

  const mapPickerInitialCoordinate = (() => {
    if (!mapPickerField) return null;
    const current = mapPickerField === 'pickup' ? pickup : destination;
    if (Number.isFinite(current?.lat) && Number.isFinite(current?.lng)) {
      return { latitude: current.lat, longitude: current.lng };
    }
    if (
      mapPickerField === 'destination' &&
      Number.isFinite(pickup?.lat) &&
      Number.isFinite(pickup?.lng)
    ) {
      return { latitude: pickup.lat, longitude: pickup.lng };
    }
    return null;
  })();

  const handleSubmit = useCallback(async () => {
    if (!pickup?.address) {
      Toast.show({ type: 'error', text1: 'Ingresá la dirección de recogida' });
      return;
    }
    if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) {
      Toast.show({ type: 'error', text1: 'Elegí una dirección del listado de sugerencias' });
      return;
    }

    if (!destination?.address || !Number.isFinite(destination?.lat)) {
      Toast.show({
        type: 'error',
        text1: 'Elegí el destino',
        text2: 'Seleccioná una dirección del listado de sugerencias.',
      });
      return;
    }

    const coverage = validatePickupForTrip(pickup.lat, pickup.lng);
    if (!coverage.allowed) {
      notifyPickupOutsideCoverage();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const result = await requestTrip({
      pickupAddress: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupPlaceId: pickup.placeId,
      destinationAddress: destination.address,
      destinationLat: destination.lat,
      destinationLng: destination.lng,
      destinationPlaceId: destination.placeId || null,
      passengerName: profile?.name || 'Pasajero',
      passengerPhone: profile?.phone || null,
      notes: notes.trim() || null,
    });

    if (result.ok) {
      navigation.replace('HomeMain');
    } else {
      Toast.show({
        type: 'error',
        text1: 'No se pudo solicitar el viaje',
        text2: result.error || 'Intentá de nuevo.',
        visibilityTime: 4000,
      });
    }
  }, [pickup, destination, notes, profile, requestTrip, navigation, validatePickupForTrip, notifyPickupOutsideCoverage]);

  const canSubmit =
    !!pickup?.address
    && Number.isFinite(pickup?.lat)
    && !!destination?.address
    && Number.isFinite(destination?.lat)
    && !pickupOutsideCoverage
    && !isCreating;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <View style={[
        styles.contentWrap,
        contentMaxW ? { maxWidth: contentMaxW, alignSelf: 'center', width: '100%' } : null,
      ]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, paddingHorizontal: screenPadding }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={colors.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Nuevo viaje</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: insets.bottom + 120,
              paddingHorizontal: screenPadding,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Route section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ruta del viaje</Text>

            {/* Route visual connector */}
            <View style={styles.routeCard}>
              <View style={styles.routeConnector}>
                <View style={styles.dotPickup} />
                <View style={styles.routeLine} />
                <View style={styles.dotDest} />
              </View>

              <View style={styles.routeInputs}>
                {/* Pickup */}
                <AddressSearchInput
                  label="RECOGIDA DEL PASAJERO"
                  icon="radio-button-on"
                  iconColor={colors.primary}
                  placeholder="Ej: Belgrano 1200, Salta"
                  value={pickup}
                  onSelect={setPickup}
                  showMapButton
                  onMapPress={() => openMapPicker('pickup')}
                  showGPSButton
                  onGPSPress={handleUseGPS}
                  isGPSLoading={gpsLoading}
                  zIndex={20}
                />
                <PickupCoverageBanner visible={pickupOutsideCoverage} />

                <View style={styles.separator} />

                {/* Destination */}
                <AddressSearchInput
                  label="DESTINO FINAL (opcional)"
                  icon="location"
                  iconColor={colors.info}
                  placeholder="Ej: Av. San Martín 500"
                  value={destination}
                  onSelect={setDestination}
                  showMapButton
                  onMapPress={() => openMapPicker('destination')}
                  zIndex={10}
                />
              </View>
            </View>
          </View>

          {/* Optional section */}
          <View style={styles.section}>
            <Pressable
              onPress={() => setShowOptional(!showOptional)}
              style={styles.optionalToggle}
            >
              <Ionicons
                name={showOptional ? 'remove-circle-outline' : 'add-circle-outline'}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.optionalToggleText}>
                {showOptional ? 'Ocultar detalles' : 'Agregar detalles adicionales'}
              </Text>
            </Pressable>

            {showOptional && (
              <View style={styles.optionalCard}>
                {/* Passenger info */}
                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={styles.infoText} numberOfLines={1}>
                    {profile?.name || 'Sin nombre'}
                  </Text>
                  <Text style={styles.infoMuted}>· Pasajero</Text>
                </View>

                {profile?.phone ? (
                  <View style={[styles.infoRow, { marginTop: 10 }]}>
                    <View style={styles.infoIcon}>
                      <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                    </View>
                    <Text style={styles.infoText}>{profile.phone}</Text>
                    <Text style={styles.infoMuted}>· Teléfono</Text>
                  </View>
                ) : null}

                <View style={styles.divider} />

                {/* Notes */}
                <Text style={styles.notesLabel}>NOTAS ADICIONALES (opcional)</Text>
                <View style={styles.notesInput}>
                  <Ionicons name="document-text-outline" size={16} color={colors.textMuted} style={{ marginTop: 3 }} />
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Ej: Portón azul, timbre roto..."
                    placeholderTextColor={colors.textLight}
                    multiline
                    numberOfLines={3}
                    style={styles.notesTextInput}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Price info */}
          <View style={styles.priceInfo}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textLight} />
            <Text style={styles.priceInfoText}>
              El precio final lo verás al completar el viaje.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed bottom submit button */}
      <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            !canSubmit && styles.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.9 },
          ]}
        >
          <LinearGradient
            colors={canSubmit ? [colors.primaryLight, colors.primary] : ['#D0D5E0', '#C8CCD8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.submitBtnGrad}
          >
            {isCreating ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.submitBtnText}>Solicitando viaje...</Text>
              </>
            ) : (
              <>
                <Ionicons name="car-sport" size={22} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>Solicitar viaje</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
      </View>

      <MapPinPickerModal
        visible={mapPickerField != null}
        fieldType={mapPickerField || 'destination'}
        initialCoordinate={mapPickerInitialCoordinate}
        onConfirm={handleMapPickerConfirm}
        onClose={() => setMapPickerField(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentWrap: { flex: 1, width: '100%' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.text,
  },

  scrollContent: { paddingTop: 20 },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textMuted,
    letterSpacing: 0.3, marginBottom: 12, marginLeft: 2,
  },

  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeConnector: {
    alignItems: 'center',
    paddingTop: 32,
    paddingRight: 12,
    width: 20,
  },
  dotPickup: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.primary, borderWidth: 2, borderColor: '#FFFFFF',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  routeLine: {
    width: 2, flex: 1, backgroundColor: colors.border,
    marginVertical: 6, minHeight: 40,
  },
  dotDest: {
    width: 12, height: 12, borderRadius: 3,
    backgroundColor: colors.info, borderWidth: 2, borderColor: '#FFFFFF',
  },
  routeInputs: { flex: 1, gap: 4 },
  separator: { height: 16 },

  optionalToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4,
  },
  optionalToggleText: {
    fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.primary,
  },

  optionalCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: colors.border,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  infoText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.textDark, flex: 1 },
  infoMuted: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 14 },

  notesLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.textMuted,
    letterSpacing: 0.5, marginBottom: 10,
  },
  notesInput: {
    flexDirection: 'row', gap: 10,
    backgroundColor: colors.surfaceRaised, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border,
    padding: 12,
  },
  notesTextInput: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular',
    color: colors.text, minHeight: 64, lineHeight: 20,
  },

  priceInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.infoBg,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  priceInfoText: {
    fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.info, flex: 1,
  },

  bottomAction: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 12,
  },
  submitBtn: { borderRadius: 16, overflow: 'hidden' },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnGrad: {
    height: 58, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 12,
  },
  submitBtnText: {
    fontSize: 17, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.2,
  },
});
