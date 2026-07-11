import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../../hooks/useResponsive';

export default function AppSplashScreen() {
  const insets = useSafeAreaInsets();
  const { s, fs } = useResponsive();
  const logoSize = s(140, { min: 96, max: 180 });

  return (
    <View style={{
      flex: 1,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Image
        source={require('../../../assets/adaptive-icon.png')}
        style={{ width: logoSize, height: logoSize }}
        contentFit="contain"
      />
      <View style={{
        position: 'absolute',
        alignItems: 'center',
        bottom: Math.max(insets.bottom, s(24)) + s(56),
      }}>
        <Text style={{
          color: '#8E8E93',
          fontSize: fs(13),
          fontFamily: 'Inter_400Regular',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}>
          Profesional
        </Text>
      </View>
    </View>
  );
}
