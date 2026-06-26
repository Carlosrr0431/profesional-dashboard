import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StatusBar,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
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
import { useTripStore } from '../stores/tripStore';
import { reverseGeocode, resolvePlaceFromSuggestion, isCoordinateFallbackText } from '../services/googleMaps';
import { loadFrequentPlaces, addRecentPlace } from '../services/recentPlaces';
import AddressSearchInput from '../components/ui/AddressSearchInput';
import MapPinPickerModal from '../components/map/MapPinPickerModal';

const ACTIVE_FIELD = { pickup: 'pickup', destination: 'destination' };

export default function TripSearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const { profile } = useAuthStore();
  const { getCurrentLocation } = useLocation();
  const { requestTrip, fetchTripHistory } = useTrip();
  const { isCreating } = useTripStore();

  const [pickup, setPickup] = useState(route.params?.pickup ?? null);
  const [destination, setDestination] = useState(route.params?.destination ?? null);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [recentPlaces, setRecentPlaces] = useState([]);
  const [activeField, setActiveField] = useState(ACTIVE_FIELD.destination);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [mapPickerField, setMapPickerField] = useState(null);

  const loadPickupFromGPS = useCallback(async () => {
    setPickupLoading(true);
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
    } catch {
      Toast.show({ type: 'error', text1: 'No se pudo obtener tu ubicación' });
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
    if (!pickup) loadPickupFromGPS();
  }, []);

  useEffect(() => {
    refreshFrequentPlaces();
  }, [refreshFrequentPlaces]);

  const handleSuggestionSelect = useCallback(async (suggestion, field) => {
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
    } else {
      setDestination(place);
      await addRecentPlace(profile?.phone, place);
      await refreshFrequentPlaces();
    }
  }, [profile?.phone, refreshFrequentPlaces]);

  const handleRecentSelect = useCallback(async (place) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const full = {
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      placeId: place.placeId,
    };
    setDestination(full);
    await addRecentPlace(profile?.phone, full);
    await refreshFrequentPlaces();
  }, [profile?.phone, refreshFrequentPlaces]);

  const handleConfirm = useCallback(async () => {
    if (!pickup?.address || !Number.isFinite(pickup?.lat)) {
      Toast.show({
        type: 'error',
        text1: 'Definí dónde te buscamos',
        text2: 'Elegí una dirección de recogida del listado.',
      });
      return;
    }

    if (!destination?.address || !Number.isFinite(destination?.lat)) {
      Toast.show({
        type: 'error',
        text1: 'Elegí tu destino',
        text2: 'Seleccioná una dirección del listado de sugerencias.',
      });
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
      notes: null,
    });

    if (result.ok) {
      navigation.replace('HomeMain');
    } else {
      Toast.show({
        type: 'error',
        text1: 'No se pudo solicitar el viaje',
        text2: result.error || 'Intentá de nuevo.',
      });
    }
  }, [pickup, destination, profile, requestTrip, navigation]);

  const openMapPicker = useCallback((field) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveField(field);
    setSuggestions([]);
    setMapPickerField(field);
  }, []);

  const handleMapPickerConfirm = useCallback(
    async (place) => {
      if (mapPickerField === ACTIVE_FIELD.pickup) {
        setPickup(place);
      } else {
        setDestination(place);
        await addRecentPlace(profile?.phone, place);
        await refreshFrequentPlaces();
      }
      setMapPickerField(null);
    },
    [mapPickerField, profile?.phone, refreshFrequentPlaces]
  );

  const mapPickerInitialCoordinate = (() => {
    if (!mapPickerField) return null;
    const current = mapPickerField === ACTIVE_FIELD.pickup ? pickup : destination;
    if (Number.isFinite(current?.lat) && Number.isFinite(current?.lng)) {
      return { latitude: current.lat, longitude: current.lng };
    }
    if (
      mapPickerField === ACTIVE_FIELD.destination &&
      Number.isFinite(pickup?.lat) &&
      Number.isFinite(pickup?.lng)
    ) {
      return { latitude: pickup.lat, longitude: pickup.lng };
    }
    return null;
  })();

  const canSubmit =
    !!pickup?.address
    && Number.isFinite(pickup?.lat)
    && !!destination?.address
    && Number.isFinite(destination?.lat)
    && !isCreating;
  const showSuggestions = suggestions.length > 0;

  const listData = showSuggestions
    ? suggestions.map((s) => ({ type: 'suggestion', ...s }))
    : recentPlaces.map((p) => ({ type: 'recent', ...p }));

  const renderListItem = ({ item }) => {
    if (item.type === 'suggestion') {
      return (
        <Pressable
          onPress={() => handleSuggestionSelect(item, activeField)}
          style={({ pressed }) => [styles.listItem, pressed && styles.listItemPressed]}
        >
          <View style={styles.listIcon}>
            <Ionicons name="location-outline" size={18} color={colors.textMuted} />
          </View>
          <Text style={styles.listTitle} numberOfLines={2}>
            {item.address}
          </Text>
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
            name={item.visitCount > 0 ? 'star' : 'time-outline'}
            size={18}
            color={item.visitCount > 0 ? colors.warning : colors.textMuted}
          />
        </View>
        <View style={styles.listTextCol}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {item.title || item.address.split(',')[0]}
          </Text>
          <Text style={styles.listSubtitle} numberOfLines={2}>
            {item.visitCount > 0
              ? `${item.visitCount} ${item.visitCount === 1 ? 'viaje' : 'viajes'} · ${item.address}`
              : item.address}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>¿A dónde vas?</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.routeCard}>
          <View style={styles.routeConnector}>
            <View style={styles.dotPickup} />
            <View style={styles.routeLine} />
            <View style={styles.dotDest} />
          </View>

          <View style={styles.routeFields}>
            <View style={styles.fieldRow}>
              <AddressSearchInput
                variant="bare"
                hideDropdown
                placeholder={pickupLoading ? 'Obteniendo ubicación...' : 'Dirección de recogida'}
                value={pickup}
                onSelect={setPickup}
                showMapButton
                onMapPress={() => openMapPicker(ACTIVE_FIELD.pickup)}
                showGPSButton
                onGPSPress={loadPickupFromGPS}
                isGPSLoading={pickupLoading}
                autoFocus={false}
                onFocusChange={(focused) => {
                  if (focused) {
                    setActiveField(ACTIVE_FIELD.pickup);
                    setSuggestions([]);
                  }
                }}
                onSuggestionsChange={(items, meta) => {
                  setSuggestions(items);
                  setSuggestionsLoading(meta.isSearching);
                }}
              />
            </View>

            <View style={styles.fieldDivider} />

            <View style={styles.fieldRow}>
              <AddressSearchInput
                variant="bare"
                hideDropdown
                placeholder="¿A dónde vas?"
                value={destination}
                onSelect={setDestination}
                showMapButton
                onMapPress={() => openMapPicker(ACTIVE_FIELD.destination)}
                autoFocus={route.params?.focusDestination !== false}
                onFocusChange={(focused) => {
                  if (focused) {
                    setActiveField(ACTIVE_FIELD.destination);
                    setSuggestions([]);
                  }
                }}
                onSuggestionsChange={(items, meta) => {
                  setSuggestions(items);
                  setSuggestionsLoading(meta.isSearching);
                }}
              />
            </View>
          </View>
        </View>

        {suggestionsLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Buscando direcciones...</Text>
          </View>
        )}

        {!showSuggestions && recentPlaces.length > 0 && (
          <Text style={styles.sectionLabel}>Destinos frecuentes</Text>
        )}

        <FlatList
          data={listData}
          keyExtractor={(item, index) =>
            item.placeId || item.address || `item-${index}`
          }
          renderItem={renderListItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          ListEmptyComponent={
            !showSuggestions && !suggestionsLoading ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={40} color={colors.textLight} />
                <Text style={styles.emptyTitle}>Buscá tu destino</Text>
                <Text style={styles.emptyDesc}>
                  Escribí al menos 2 letras para ver sugerencias en Salta.
                </Text>
              </View>
            ) : null
          }
        />
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleConfirm}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.confirmBtn,
            !canSubmit && styles.confirmBtnDisabled,
            pressed && canSubmit && { opacity: 0.92 },
          ]}
        >
          <LinearGradient
            colors={
              canSubmit
                ? [colors.primaryLight, colors.primary]
                : ['#D0D5E0', '#C8CCD8']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.confirmBtnGrad}
          >
            {isCreating ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.confirmBtnText}>Solicitando...</Text>
              </>
            ) : (
              <Text style={styles.confirmBtnText}>
                {destination?.address ? 'Confirmar viaje' : 'Pedir viaje sin destino'}
              </Text>
            )}
          </LinearGradient>
        </Pressable>
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    marginRight: 44,
  },
  headerSpacer: { width: 0 },

  routeCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeConnector: {
    alignItems: 'center',
    paddingTop: 14,
    paddingRight: 14,
    width: 20,
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#14B8A6',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
    minHeight: 28,
  },
  dotDest: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.warning,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  routeFields: { flex: 1 },
  fieldRow: { minHeight: 44, justifyContent: 'center' },
  fieldDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },

  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },

  listContent: { paddingTop: 4 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  listItemPressed: { backgroundColor: colors.surfaceRaised },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTextCol: { flex: 1 },
  listTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    lineHeight: 20,
  },
  listSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    marginTop: 8,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  confirmBtn: { borderRadius: 14, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnGrad: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
});
