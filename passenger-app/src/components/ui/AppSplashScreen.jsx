import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppSplashScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Image
        source={require('../../../assets/adaptive-icon.png')}
        style={styles.logo}
        contentFit="contain"
      />
      <View style={[styles.footer, { bottom: Math.max(insets.bottom, 24) + 56 }]}>
        <Text style={styles.footerText}>Profesional</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 140,
    height: 140,
  },
  footer: {
    position: 'absolute',
    alignItems: 'center',
  },
  footerText: {
    color: '#8E8E93',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
