import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Keyboard,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/layout';
import AddressSearchInput from '../ui/AddressSearchInput';
import { resolvePlaceFromSuggestion } from '../../services/googleMaps';
import { useResponsive } from '../../hooks/useResponsive';
import { CONTENT_MAX_WIDTH } from '../../utils/responsive';

/**
 * Sheet dedicado para buscar cada parada intermedia (estilo DiDi).
 * No comparte el listado del modal principal para evitar desbordes.
 */
export default function StopDestinationSheet({
  visible,
  stopIndex = 0,
  initialPlace = null,
  recentPlaces = [],
  onSelect,
  onClose,
  onMapPress,
}) {
  const insets = useSafeAreaInsets();
  const { screenPadding, isTablet, isLandscape } = useResponsive();
  const contentMaxW = (isTablet || isLandscape) ? CONTENT_MAX_WIDTH : undefined;
  const inputRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [draftPlace, setDraftPlace] = useState(initialPlace);

  useEffect(() => {
    if (!visible) return;
    setDraftPlace(initialPlace);
    setSuggestions([]);
    setSuggestionsLoading(false);
    const timer = setTimeout(() => inputRef.current?.focus?.(), 120);
    return () => clearTimeout(timer);
  }, [visible, initialPlace, stopIndex]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose?.();
  }, [onClose]);

  const handleSuggestionSelect = useCallback(async (suggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    setSuggestions([]);

    try {
      const place = await resolvePlaceFromSuggestion(suggestion);
      onSelect?.(place, stopIndex);
    } catch {
      onSelect?.({
        address: suggestion.address,
        lat: Number.isFinite(suggestion.lat) ? suggestion.lat : null,
        lng: Number.isFinite(suggestion.lng) ? suggestion.lng : null,
        placeId: suggestion.placeId,
        title: suggestion.title,
        subtitle: suggestion.subtitle,
      }, stopIndex);
    }
  }, [onSelect, stopIndex]);

  const handleRecentSelect = useCallback((place) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onSelect?.({
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      placeId: place.placeId || null,
    }, stopIndex);
  }, [onSelect, stopIndex]);

  const showRecent = suggestions.length === 0 && !suggestionsLoading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <View style={[styles.root, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 0) }]}>
        <View style={[
          styles.contentWrap,
          contentMaxW ? { maxWidth: contentMaxW, alignSelf: 'center', width: '100%' } : null,
        ]}>
        <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            accessibilityLabel="Volver"
          >
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>¿A dónde vamos?</Text>
          <View style={styles.headerBtn} />
        </View>

        <View style={[styles.inputBlock, { paddingHorizontal: screenPadding }]}>
          <View style={styles.inputRow}>
            <View style={styles.dotStop} />
            <View style={styles.inputCol}>
              <AddressSearchInput
                ref={inputRef}
                compact
                hideDropdown
                showLeadingIcon={false}
                iconColor={colors.warning}
                placeholder={`Parada ${stopIndex + 1} · ¿A dónde vamos?`}
                value={draftPlace}
                onSelect={(place) => onSelect?.(place, stopIndex)}
                showMapButton
                onMapPress={onMapPress}
                onSuggestionsChange={(items, meta) => {
                  setSuggestions(items);
                  setSuggestionsLoading(meta.isSearching);
                }}
              />
            </View>
            <Pressable onPress={handleClose} hitSlop={8} style={styles.cancelTextBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.results}
          contentContainerStyle={[
            styles.resultsContent,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              paddingHorizontal: screenPadding,
            },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {suggestionsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Buscando direcciones...</Text>
            </View>
          ) : null}

          {suggestions.map((item, index) => (
            <Pressable
              key={item.placeId || item.address || `s-${index}`}
              onPress={() => handleSuggestionSelect(item)}
              style={({ pressed }) => [styles.resultItem, pressed && styles.resultItemPressed]}
            >
              <View style={styles.resultIcon}>
                <Ionicons name="location" size={16} color={colors.accent} />
              </View>
              <View style={styles.resultTextCol}>
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {item.title || item.address.split(',')[0]}
                </Text>
                <Text style={styles.resultSubtitle} numberOfLines={1}>
                  {item.subtitle || item.address.split(',').slice(1).join(',').trim()}
                </Text>
              </View>
            </Pressable>
          ))}

          {showRecent && recentPlaces.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Destinos frecuentes</Text>
              {recentPlaces.map((place, index) => (
                <Pressable
                  key={place.placeId || place.address || `r-${index}`}
                  onPress={() => handleRecentSelect(place)}
                  style={({ pressed }) => [styles.resultItem, pressed && styles.resultItemPressed]}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons
                      name={place.visitCount > 0 ? 'star' : 'time'}
                      size={16}
                      color={place.visitCount > 0 ? colors.warning : colors.primaryLight}
                    />
                  </View>
                  <View style={styles.resultTextCol}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {place.title || place.address.split(',')[0]}
                    </Text>
                    <Text style={styles.resultSubtitle} numberOfLines={1}>
                      {place.visitCount > 0
                        ? `${place.visitCount} ${place.visitCount === 1 ? 'viaje' : 'viajes'} · ${place.address}`
                        : place.address}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}

          {!suggestionsLoading && suggestions.length === 0 && recentPlaces.length === 0 ? (
            <View style={styles.emptyHint}>
              <Ionicons name="search-outline" size={28} color={colors.accentLight} />
              <Text style={styles.emptyText}>
                Escribí al menos 2 letras para ver direcciones en Salta.
              </Text>
            </View>
          ) : null}
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  contentWrap: {
    flex: 1,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerBtnPressed: {
    backgroundColor: colors.accentMuted,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: -0.3,
  },
  inputBlock: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dotStop: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.warning,
    marginTop: 30,
  },
  inputCol: {
    flex: 1,
    minWidth: 0,
  },
  cancelTextBtn: {
    paddingTop: 28,
    paddingHorizontal: spacing.xs,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
  },
  results: {
    flex: 1,
  },
  resultsContent: {
    paddingTop: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  resultItemPressed: {
    backgroundColor: colors.accentSoft,
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextCol: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: colors.primary,
  },
  resultSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyHint: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
