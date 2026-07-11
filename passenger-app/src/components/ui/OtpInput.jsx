import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform, InteractionManager } from 'react-native';
import { colors } from '../../theme/colors';
import { useResponsive } from '../../hooks/useResponsive';

export default function OtpInput({
  value = '',
  onChange,
  onComplete,
  autoFocus = false,
  length = 4,
  columns = null,
  size = 'md',
  autoComplete,
}) {
  const inputRef = useRef(null);
  const { s, fs, isCompactHeight } = useResponsive();

  const metrics = useMemo(() => {
    const sizes = {
      sm: { box: s(46), height: s(54, { min: 48 }), fontSize: fs(20), gap: s(8), radius: s(14) },
      md: {
        box: s(isCompactHeight ? 48 : 56, { min: 44 }),
        height: s(isCompactHeight ? 56 : 64, { min: 48 }),
        fontSize: fs(isCompactHeight ? 22 : 26),
        gap: s(12),
        radius: s(16),
      },
    };
    return sizes[size] || sizes.md;
  }, [s, fs, size, isCompactHeight]);

  const cleanValue = String(value || '').replace(/\D/g, '').slice(0, length);

  const digits = useMemo(() => {
    const arr = cleanValue.split('');
    while (arr.length < length) arr.push('');
    return arr;
  }, [cleanValue, length]);

  const rowIndices = useMemo(() => {
    if (!columns || columns >= length) {
      return [Array.from({ length }, (_, i) => i)];
    }
    const rows = [];
    for (let i = 0; i < length; i += columns) {
      rows.push(Array.from({ length: columns }, (_, j) => i + j).filter((idx) => idx < length));
    }
    return rows;
  }, [columns, length]);

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.blur();
    setTimeout(() => input.focus(), 64);
  }, []);

  useEffect(() => {
    if (!autoFocus) return undefined;

    let focusTimer;
    const interaction = InteractionManager.runAfterInteractions(() => {
      const delay = Platform.OS === 'android' ? 480 : 320;
      focusTimer = setTimeout(focusInput, delay);
    });

    return () => {
      interaction.cancel();
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [autoFocus, focusInput]);

  const handleChange = (text) => {
    const next = text.replace(/\D/g, '').slice(0, length);
    onChange?.(next);
    if (next.length === length) onComplete?.(next);
  };

  const resolvedAutoComplete = autoComplete
    ?? (length === 4
      ? (Platform.OS === 'android' ? 'sms-otp' : 'one-time-code')
      : 'tel');

  const inputHeight = useMemo(() => {
    const rowCount = rowIndices.length;
    const rowGaps = Math.max(0, rowCount - 1) * metrics.gap;
    return rowCount * metrics.height + rowGaps;
  }, [rowIndices, metrics]);

  return (
    <Pressable onPress={focusInput} style={styles.wrap}>
      <TextInput
        ref={inputRef}
        value={cleanValue}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        textContentType={length === 4 ? 'oneTimeCode' : 'telephoneNumber'}
        autoComplete={resolvedAutoComplete}
        style={[styles.hiddenInput, { height: inputHeight }]}
        caretHidden
        showSoftInputOnFocus
        importantForAutofill="yes"
        underlineColorAndroid="transparent"
      />

      <View style={styles.rows}>
        {rowIndices.map((indices, rowKey) => (
          <View
            key={`row-${rowKey}`}
            style={[styles.row, { gap: metrics.gap, marginBottom: rowKey < rowIndices.length - 1 ? metrics.gap : 0 }]}
          >
            {indices.map((index) => {
              const digit = digits[index];
              const isActive = cleanValue.length === index;
              const isFilled = digit.length > 0;
              return (
                <Pressable
                  key={index}
                  onPress={focusInput}
                  style={[
                    styles.box,
                    {
                      width: metrics.box,
                      height: metrics.height,
                      borderRadius: metrics.radius,
                    },
                    isActive && styles.boxActive,
                    isFilled && styles.boxFilled,
                  ]}
                >
                  <Text
                    style={[
                      styles.digit,
                      { fontSize: metrics.fontSize, lineHeight: metrics.fontSize + 6 },
                      isFilled && styles.digitFilled,
                    ]}
                  >
                    {digit}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center' },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0.02,
    color: 'transparent',
    zIndex: 1,
  },
  rows: { width: '100%', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  box: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    borderColor: colors.primary,
    backgroundColor: '#FAFBFF',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  boxFilled: {
    borderColor: colors.primary,
    backgroundColor: '#FFFFFF',
  },
  digit: {
    fontFamily: 'Inter_700Bold',
    color: colors.textLight,
  },
  digitFilled: {
    color: colors.text,
  },
});
