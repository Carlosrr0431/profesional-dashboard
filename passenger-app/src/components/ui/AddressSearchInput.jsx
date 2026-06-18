import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/layout';
import { autocompleteAddressSalta, getPlaceDetails } from '../../services/googleMaps';
import MapPickerIcon from './MapPickerIcon';

const DEBOUNCE_MS = 400;

const AddressSearchInput = forwardRef(({
  label,
  icon = 'location-outline',
  iconColor,
  placeholder = 'Buscar dirección...',
  value,
  onSelect,
  onGPSPress,
  onMapPress,
  onFocusChange,
  showGPSButton = false,
  showMapButton = false,
  isGPSLoading = false,
  editable = true,
  zIndex = 1,
  suggestionsAbove = false,
  compact = false,
  autoFocus = false,
  variant = 'default',
  hideDropdown = false,
  onSuggestionsChange,
  showLeadingIcon = true,
}, ref) => {
  const [query, setQuery] = useState(value?.address || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAtStart, setSelectionAtStart] = useState(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const isFocusedRef = useRef(false);
  const queryRef = useRef(value?.address || '');
  const scrollTimeoutRef = useRef([]);
  const onSuggestionsChangeRef = useRef(onSuggestionsChange);
  onSuggestionsChangeRef.current = onSuggestionsChange;

  const clearScrollTimeouts = useCallback(() => {
    scrollTimeoutRef.current.forEach(clearTimeout);
    scrollTimeoutRef.current = [];
  }, []);

  /** En Android el TextInput queda scrolleado al final tras elegir una dirección. */
  const scrollInputToStart = useCallback(() => {
    if (isFocusedRef.current) return;

    const apply = () => {
      if (isFocusedRef.current) return;
      inputRef.current?.setNativeProps?.({
        selection: { start: 0, end: 0 },
      });
    };

    if (Platform.OS === 'android') {
      setSelectionAtStart({ start: 0, end: 0 });
      const clearSelection = setTimeout(() => setSelectionAtStart(null), 320);
      scrollTimeoutRef.current.push(clearSelection);
    }

    requestAnimationFrame(() => {
      apply();
      if (Platform.OS === 'android' && !isFocusedRef.current) {
        requestAnimationFrame(apply);
        scrollTimeoutRef.current.push(setTimeout(apply, 48));
        scrollTimeoutRef.current.push(setTimeout(apply, 120));
      }
    });
  }, []);

  const placeCursorAtEnd = useCallback(() => {
    if (!isFocusedRef.current) return;
    const len = String(queryRef.current || '').length;
    if (len === 0) return;
    inputRef.current?.setNativeProps?.({
      selection: { start: len, end: len },
    });
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    scrollToStart: scrollInputToStart,
  }));

  useEffect(() => {
    const externalAddress = String(value?.address || '').trim();

    if (isFocusedRef.current) {
      return undefined;
    }

    if (!externalAddress) {
      setQuery((prev) => {
        if (prev !== '') queryRef.current = '';
        return prev !== '' ? '' : prev;
      });
      return undefined;
    }

    setQuery((prev) => {
      if (prev === externalAddress) return prev;
      // Conservar texto que el usuario escribió aunque aún no confirmó la dirección.
      if (prev.trim().length > 0 && prev.trim() !== externalAddress) return prev;
      queryRef.current = externalAddress;
      return externalAddress;
    });

    scrollInputToStart();
    if (Platform.OS !== 'android') return undefined;

    const t1 = setTimeout(scrollInputToStart, 60);
    const t2 = setTimeout(scrollInputToStart, 180);
    scrollTimeoutRef.current.push(t1, t2);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      scrollTimeoutRef.current = scrollTimeoutRef.current.filter(
        (id) => id !== t1 && id !== t2
      );
    };
  }, [value?.address, scrollInputToStart]);

  const notifySuggestions = useCallback((items, meta) => {
    onSuggestionsChangeRef.current?.(items, meta);
  }, []);

  const handleChange = useCallback((text) => {
    queryRef.current = text;
    setQuery(text);
    setSuggestions([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 3) {
      if (hideDropdown) {
        notifySuggestions([], { isSearching: false, isFocused: true });
      }
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      notifySuggestions([], { isSearching: true, isFocused: true });
      try {
        const results = await autocompleteAddressSalta(text.trim());
        setSuggestions(results);
        notifySuggestions(results, { isSearching: false, isFocused: true });
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
  }, [hideDropdown, notifySuggestions]);

  const handleSelect = useCallback(async (suggestion) => {
    setIsSelecting(true);
    queryRef.current = suggestion.address;
    setQuery(suggestion.address);
    scrollInputToStart();
    setSuggestions([]);
    notifySuggestions([], { isSearching: false, isFocused: false });
    Keyboard.dismiss();

    const hasCoords = Number.isFinite(suggestion.lat) && Number.isFinite(suggestion.lng);

    try {
      if (hasCoords) {
        onSelect?.({
          address: suggestion.address,
          lat: suggestion.lat,
          lng: suggestion.lng,
          placeId: suggestion.placeId,
        });
        return;
      }

      const details = await getPlaceDetails(suggestion.placeId);
      onSelect?.({
        address: suggestion.address,
        lat: details.lat,
        lng: details.lng,
        placeId: suggestion.placeId,
      });
    } catch {
      onSelect?.({
        address: suggestion.address,
        lat: hasCoords ? suggestion.lat : null,
        lng: hasCoords ? suggestion.lng : null,
        placeId: suggestion.placeId,
      });
    } finally {
      setIsSelecting(false);
      scrollInputToStart();
    }
  }, [notifySuggestions, onSelect, scrollInputToStart]);

  const handleClear = useCallback(() => {
    queryRef.current = '';
    setQuery('');
    setSuggestions([]);
    notifySuggestions([], { isSearching: false, isFocused: true });
    onSelect?.(null);
    inputRef.current?.focus();
  }, [notifySuggestions, onSelect]);

  const resolvedIconColor = iconColor || colors.primary;
  const isBare = variant === 'bare';
  const scrollEnabled = isFocused;

  const textInputStyle = [
    styles.input,
    compact && styles.inputCompact,
    isBare && styles.bareInput,
    Platform.OS === 'android' && styles.inputAndroid,
    Platform.OS === 'android' && compact && styles.inputAndroidCompact,
    isFocused && styles.inputFocused,
  ];

  return (
    <View
      style={[styles.wrapper, { zIndex }, isBare && styles.wrapperBare]}
      collapsable={false}
    >
      {label && !isBare ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}

      <View
        collapsable={false}
        style={[
          !isBare && styles.inputRow,
          !isBare && compact && styles.inputRowCompact,
          !isBare && !showLeadingIcon && styles.inputRowNoIcon,
          !isBare && isFocused && styles.inputRowFocused,
          isBare && styles.bareRow,
        ]}
      >
        {!isBare && showLeadingIcon ? (
          <View
            style={[
              styles.iconBox,
              compact && styles.iconBoxCompact,
              { backgroundColor: `${resolvedIconColor}18` },
            ]}
          >
            <Ionicons name={icon} size={compact ? 16 : 18} color={resolvedIconColor} />
          </View>
        ) : null}

        <View style={styles.inputFieldWrap}>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={handleChange}
            onFocus={() => {
              clearScrollTimeouts();
              isFocusedRef.current = true;
              setIsFocused(true);
              setSelectionAtStart(null);
              onFocusChange?.(true);
              requestAnimationFrame(placeCursorAtEnd);
            }}
            onBlur={() => {
              isFocusedRef.current = false;
              setIsFocused(false);
              onFocusChange?.(false);
              const committed = String(value?.address || '').trim();
              if (!query.trim() && committed) {
                queryRef.current = committed;
                setQuery(committed);
              } else if (query.trim() === committed) {
                scrollInputToStart();
              }
            }}
            autoFocus={autoFocus}
            placeholder={placeholder}
            placeholderTextColor={colors.textLight}
            editable={editable && !isSelecting}
            style={textInputStyle}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="words"
            blurOnSubmit={false}
            showSoftInputOnFocus
            underlineColorAndroid="transparent"
            importantForAutofill="no"
            textAlign="left"
            multiline={false}
            scrollEnabled={scrollEnabled}
            selection={
              !isFocused && query.length > 0 && selectionAtStart
                ? selectionAtStart
                : undefined
            }
          />
        </View>

        {isSearching || isSelecting ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.rightAction} />
        ) : (
          <View style={styles.rightActions}>
            {query.length > 0 ? (
              <Pressable onPress={handleClear} hitSlop={8} style={styles.rightAction}>
                <Ionicons
                  name="close-circle"
                  size={compact ? 16 : 18}
                  color={colors.textLight}
                />
              </Pressable>
            ) : null}
            {showMapButton ? (
              <Pressable
                onPress={onMapPress}
                hitSlop={8}
                style={[styles.rightAction, styles.mapBtn, compact && styles.mapBtnCompact]}
                accessibilityLabel="Elegir en el mapa"
              >
                <MapPickerIcon size={compact ? 14 : 16} color={colors.accent} />
              </Pressable>
            ) : null}
            {query.length === 0 && showGPSButton ? (
              <Pressable
                onPress={onGPSPress}
                hitSlop={8}
                style={[styles.rightAction, styles.gpsBtn]}
                disabled={isGPSLoading}
              >
                {isGPSLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="locate" size={17} color={colors.primary} />
                )}
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      {!hideDropdown && suggestions.length > 0 ? (
        <View
          style={[
            styles.suggestionsContainer,
            suggestionsAbove && styles.suggestionsAbove,
          ]}
        >
          <FlatList
            data={suggestions}
            keyExtractor={(item, index) => item.placeId || `${item.address}-${index}`}
            scrollEnabled={false}
            keyboardShouldPersistTaps="always"
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [
                  styles.suggestionItem,
                  index < suggestions.length - 1 && styles.suggestionBorder,
                  pressed && styles.suggestionPressed,
                ]}
              >
                <Ionicons name="location-outline" size={15} color={colors.textMuted} style={styles.suggestionIcon} />
                <Text style={styles.suggestionText} numberOfLines={2}>
                  {item.address}
                </Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
});

AddressSearchInput.displayName = 'AddressSearchInput';

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  wrapperBare: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    minHeight: 52,
    overflow: 'hidden',
  },
  inputRowCompact: {
    minHeight: 46,
    borderRadius: 12,
    paddingRight: spacing.xs,
  },
  inputRowNoIcon: {
    paddingLeft: spacing.sm,
  },
  inputFieldWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  iconBoxCompact: {
    width: 28,
    height: 28,
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  inputCompact: {
    width: '100%',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.textDark,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    paddingLeft: Platform.OS === 'android' ? 2 : 0,
    paddingRight: 2,
    margin: 0,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  inputFocused: {
    color: colors.textDark,
  },
  inputAndroid: {
    textAlignVertical: 'center',
  },
  inputAndroidCompact: {
    paddingVertical: 9,
  },
  inputRowFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  bareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    width: '100%',
  },
  bareInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  input: {
    width: '100%',
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    paddingVertical: 12,
    paddingLeft: 0,
    paddingRight: 4,
    margin: 0,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  rightAction: {
    paddingLeft: spacing.xs,
    flexShrink: 0,
  },
  mapBtn: {
    backgroundColor: 'transparent',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 5,
    marginLeft: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBtnCompact: {
    paddingHorizontal: 3,
    paddingVertical: 3,
    marginLeft: 2,
  },
  gpsBtn: {
    backgroundColor: `${colors.primary}14`,
    borderRadius: 8,
    padding: 6,
    marginLeft: spacing.xs,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    maxHeight: 220,
  },
  suggestionsAbove: {
    top: undefined,
    bottom: '100%',
    marginTop: 0,
    marginBottom: 6,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  suggestionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggestionPressed: {
    backgroundColor: `${colors.primary}08`,
  },
  suggestionIcon: {
    marginRight: 10,
    flexShrink: 0,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textDark,
    lineHeight: 20,
  },
});

export default AddressSearchInput;
