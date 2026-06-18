import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Ícono minimalista: tile de mapa con punto de ubicación.
 */
export default function MapPickerIcon({ size = 16, color = '#245f8d' }) {
  const tile = Math.round(size);
  const dot = Math.max(3, Math.round(size * 0.28));

  return (
    <View
      style={[
        styles.tile,
        {
          width: tile,
          height: tile,
          borderRadius: Math.round(tile * 0.28),
          borderColor: color,
          backgroundColor: `${color}0C`,
        },
      ]}
    >
      <View style={[styles.gridH, { backgroundColor: color }]} />
      <View style={[styles.gridV, { backgroundColor: color }]} />
      <View
        style={{
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.25,
    overflow: 'hidden',
  },
  gridH: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: '50%',
    height: StyleSheet.hairlineWidth * 2,
    opacity: 0.35,
  },
  gridV: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: '50%',
    width: StyleSheet.hairlineWidth * 2,
    opacity: 0.35,
  },
});
