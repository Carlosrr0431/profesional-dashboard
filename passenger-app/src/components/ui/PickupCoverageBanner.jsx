import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/layout';
import { PICKUP_OUTSIDE_COVERAGE_MESSAGE } from '../../../../shared/geo/serviceZones';

function PickupCoverageBanner({ visible = false }) {
  if (!visible) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={colors.warningDark} />
      <Text style={styles.text}>{PICKUP_OUTSIDE_COVERAGE_MESSAGE}</Text>
    </View>
  );
}

export default memo(PickupCoverageBanner);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_500Medium',
    color: colors.warningDark,
  },
});
