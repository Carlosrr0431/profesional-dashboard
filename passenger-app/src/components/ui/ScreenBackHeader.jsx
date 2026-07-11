import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useResponsive } from '../../hooks/useResponsive';

export default function ScreenBackHeader({ title, subtitle }) {
  const navigation = useNavigation();
  const { s, fs, screenPadding } = useResponsive();
  const btnSize = s(44, { min: 40 });

  return (
    <View style={{
      paddingHorizontal: screenPadding,
      paddingBottom: s(12),
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      backgroundColor: colors.surface,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            width: btnSize,
            height: btnSize,
            borderRadius: s(14),
            backgroundColor: colors.accentMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={s(22)} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: s(8) }}>
          <Text style={{
            fontSize: fs(18),
            fontFamily: 'Inter_700Bold',
            color: colors.primary,
            letterSpacing: -0.3,
            textAlign: 'center',
          }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{
              fontSize: fs(13),
              fontFamily: 'Inter_400Regular',
              color: colors.textMuted,
              marginTop: 2,
              textAlign: 'center',
            }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={{ width: btnSize }} />
      </View>
    </View>
  );
}
