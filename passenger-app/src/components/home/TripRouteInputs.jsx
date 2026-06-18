import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { radius, shadow, spacing } from '../../theme/layout';
import AddressSearchInput from '../ui/AddressSearchInput';

const ACTIVE_FIELD = {
  pickup: 'pickup',
  firstParada: 'first-parada',
};

const MAX_PARADAS = 3;

function makeParadaField(index) {
  return `parada-${index}`;
}

function isParadaField(field) {
  return String(field || '').startsWith('parada-') || field === ACTIVE_FIELD.firstParada;
}

function paradaIndexFromField(field) {
  if (field === ACTIVE_FIELD.firstParada) return 0;
  return Number(String(field || '').split('-')[1]);
}

const makeStopField = makeParadaField;
const isStopField = isParadaField;
const stopIndexFromField = paradaIndexFromField;
const MAX_STOPS = MAX_PARADAS;

function ParadaRow({
  parada,
  index,
  total,
  compactLayout,
  onPress,
  onRemove,
  onMoveUp,
  onMoveDown,
}) {
  const hasAddress = Boolean(parada?.address);
  const label = `PARADA ${index + 1}`;
  const title = hasAddress ? parada.address : `Agregar parada ${index + 1}`;

  return (
    <View>
      <View style={[styles.fieldDivider, compactLayout && styles.fieldDividerCompact]} />
      <View style={styles.paradaRow}>
        <Pressable
          onPress={() => onPress?.(index)}
          style={({ pressed }) => [
            styles.paradaSummary,
            pressed && styles.paradaSummaryPressed,
          ]}
        >
          <Text style={styles.paradaLabel}>{label}</Text>
          <Text
            style={[styles.paradaText, !hasAddress && styles.paradaPlaceholder]}
            numberOfLines={2}
          >
            {title}
          </Text>
        </Pressable>
        <View style={styles.paradaActions}>
          <Pressable
            onPress={() => onMoveUp?.(index)}
            disabled={index === 0}
            hitSlop={4}
            style={({ pressed }) => [
              styles.paradaActionBtn,
              index === 0 && styles.paradaActionBtnDisabled,
              pressed && index > 0 && styles.paradaActionBtnPressed,
            ]}
          >
            <Ionicons
              name="chevron-up"
              size={15}
              color={index === 0 ? colors.border : colors.textMuted}
            />
          </Pressable>
          <Pressable
            onPress={() => onMoveDown?.(index)}
            disabled={index >= total - 1}
            hitSlop={4}
            style={({ pressed }) => [
              styles.paradaActionBtn,
              index >= total - 1 && styles.paradaActionBtnDisabled,
              pressed && index < total - 1 && styles.paradaActionBtnPressed,
            ]}
          >
            <Ionicons
              name="chevron-down"
              size={15}
              color={index >= total - 1 ? colors.border : colors.textMuted}
            />
          </Pressable>
          <Pressable
            onPress={() => onRemove?.(index)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.paradaActionBtn,
              pressed && styles.paradaActionBtnPressed,
            ]}
          >
            <Ionicons name="close" size={17} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ParadaInputRow({
  inputRef,
  label,
  placeholder,
  value,
  compactLayout,
  canAddParada,
  onSelect,
  onMapPress,
  onFocus,
  onSuggestionsChange,
  onPressAddParada,
}) {
  return (
    <>
      <View style={[styles.fieldDivider, compactLayout && styles.fieldDividerCompact]} />
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.inputAddRow}>
        <View style={styles.inputAddCol}>
          <AddressSearchInput
            ref={inputRef}
            compact
            hideDropdown
            showLeadingIcon={false}
            placeholder={placeholder}
            value={value}
            onSelect={onSelect}
            showMapButton
            onMapPress={onMapPress}
            onFocusChange={onFocus}
            onSuggestionsChange={onSuggestionsChange}
          />
        </View>
        {canAddParada ? (
          <Pressable
            onPress={onPressAddParada}
            hitSlop={6}
            style={({ pressed }) => [
              styles.addParadaBtn,
              pressed && styles.addParadaBtnPressed,
            ]}
            accessibilityLabel="Agregar parada"
          >
            <Ionicons name="add" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

function TripRouteInputs({
  pickupInputRef,
  firstParadaInputRef,
  pickup,
  paradas = [],
  pickupLoading,
  compactLayout = false,
  canAddParada = true,
  onPickupSelect,
  onFirstParadaSelect,
  onLastParadaSelect,
  onPickupGPS,
  onPickupMap,
  onFirstParadaMap,
  onLastParadaMap,
  onPickupFocus,
  onFirstParadaFocus,
  onLastParadaFocus,
  onPickupSuggestionsChange,
  onFirstParadaSuggestionsChange,
  onLastParadaSuggestionsChange,
  onPressParada,
  onPressAddParada,
  onRemoveParada,
  onMoveParadaUp,
  onMoveParadaDown,
}) {
  const intermediateParadas = paradas.length > 1 ? paradas.slice(0, -1) : [];
  const activeParada = paradas.length > 0 ? paradas[paradas.length - 1] : null;
  const activeLabel = paradas.length > 1 ? `PARADA ${paradas.length}` : 'DESTINO';
  const activePlaceholder = '¿A dónde vas?';

  return (
    <View style={[styles.routeCard, compactLayout && styles.routeCardCompact]}>
      <AddressSearchInput
        ref={pickupInputRef}
        label="RECOGIDA"
        compact
        hideDropdown
        showLeadingIcon={false}
        iconColor={colors.accent}
        placeholder={
          pickupLoading ? 'Obteniendo ubicación...' : 'Dirección de recogida'
        }
        value={pickup}
        onSelect={onPickupSelect}
        showMapButton
        onMapPress={onPickupMap}
        showGPSButton
        onGPSPress={onPickupGPS}
        isGPSLoading={pickupLoading}
        onFocusChange={onPickupFocus}
        onSuggestionsChange={onPickupSuggestionsChange}
      />

      {intermediateParadas.map((parada, index) => (
        <ParadaRow
          key={`parada-${index}-${parada?.placeId || parada?.address || 'empty'}`}
          parada={parada}
          index={index}
          total={paradas.length}
          compactLayout={compactLayout}
          onPress={onPressParada}
          onRemove={onRemoveParada}
          onMoveUp={onMoveParadaUp}
          onMoveDown={onMoveParadaDown}
        />
      ))}

      <ParadaInputRow
        inputRef={firstParadaInputRef}
        label={activeLabel}
        placeholder={activePlaceholder}
        value={paradas.length === 0 ? null : activeParada}
        compactLayout={compactLayout}
        canAddParada={canAddParada}
        onSelect={paradas.length === 0 ? onFirstParadaSelect : onLastParadaSelect}
        onMapPress={paradas.length === 0 ? onFirstParadaMap : onLastParadaMap}
        onFocus={paradas.length === 0 ? onFirstParadaFocus : onLastParadaFocus}
        onSuggestionsChange={
          paradas.length === 0 ? onFirstParadaSuggestionsChange : onLastParadaSuggestionsChange
        }
        onPressAddParada={onPressAddParada}
      />
    </View>
  );
}

export {
  ACTIVE_FIELD,
  MAX_PARADAS,
  MAX_STOPS,
  makeParadaField,
  makeStopField,
  isParadaField,
  isStopField,
  paradaIndexFromField,
  stopIndexFromField,
};
export default memo(TripRouteInputs);

const styles = StyleSheet.create({
  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  routeCardCompact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  fieldDividerCompact: {
    marginVertical: spacing.sm,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 2,
  },
  inputAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  inputAddCol: {
    flex: 1,
    minWidth: 0,
  },
  addParadaBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    flexShrink: 0,
  },
  addParadaBtnPressed: {
    backgroundColor: colors.accentMuted,
  },
  paradaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
  },
  paradaSummary: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.xs,
    paddingRight: 2,
  },
  paradaSummaryPressed: {
    opacity: 0.75,
  },
  paradaLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  paradaText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.primary,
    lineHeight: 19,
  },
  paradaPlaceholder: {
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  paradaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingTop: 2,
    marginLeft: -2,
  },
  paradaActionBtn: {
    width: 22,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  paradaActionBtnDisabled: {
    opacity: 0.3,
  },
  paradaActionBtnPressed: {
    backgroundColor: colors.accentMuted,
  },
});
