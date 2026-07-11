import React, { memo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useResponsive } from '../../hooks/useResponsive';
import { PICKUP_OUTSIDE_COVERAGE_MESSAGE } from '../../../shared/geo/serviceZones';

function PickupCoverageBanner({ visible = false }) {
  const { s, fs } = useResponsive();
  if (!visible) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: s(8),
        marginTop: s(8),
        padding: s(8),
        borderRadius: s(14),
        backgroundColor: colors.warningBg,
        borderWidth: 1,
        borderColor: 'rgba(217, 119, 6, 0.25)',
      }}
      accessibilityRole="alert"
    >
      <Ionicons name="alert-circle" size={s(18)} color={colors.warningDark} />
      <Text style={{
        flex: 1,
        fontSize: fs(13),
        lineHeight: fs(18),
        fontFamily: 'Inter_500Medium',
        color: colors.warningDark,
      }}>
        {PICKUP_OUTSIDE_COVERAGE_MESSAGE}
      </Text>
    </View>
  );
}

export default memo(PickupCoverageBanner);
