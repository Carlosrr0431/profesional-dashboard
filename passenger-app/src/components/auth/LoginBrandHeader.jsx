import React from 'react';
import { Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
export const LOGO_WIDTH = width * 0.58;
export const BRAND_BLUE = '#282e69';

export function LoginBrandHeader({ style }) {
  return (
    <Animated.View
      entering={FadeIn.delay(150).duration(500)}
      style={[{ alignItems: 'center', width: '100%', marginBottom: 20 }, style]}
    >
      <Image
        source={require('../../../assets/logo-light.png')}
        style={{ width: LOGO_WIDTH, height: undefined, aspectRatio: 550 / 295 }}
        contentFit="contain"
      />
    </Animated.View>
  );
}
