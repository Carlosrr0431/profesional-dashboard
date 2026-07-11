import React from 'react';
import { useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useResponsive } from '../../hooks/useResponsive';

export const BRAND_BLUE = '#282e69';

export function LoginBrandHeader({ style }) {
  const { width } = useWindowDimensions();
  const { isLandscape, isTablet, s } = useResponsive();
  const logoWidth = Math.min(
    width * (isLandscape ? 0.32 : 0.58),
    isTablet ? 280 : 220,
  );

  return (
    <Animated.View
      entering={FadeIn.delay(150).duration(500)}
      style={[{ alignItems: 'center', width: '100%', marginBottom: s(isLandscape ? 12 : 20) }, style]}
    >
      <Image
        source={require('../../../assets/logo-light.png')}
        style={{ width: logoWidth, height: undefined, aspectRatio: 550 / 295 }}
        contentFit="contain"
      />
    </Animated.View>
  );
}
