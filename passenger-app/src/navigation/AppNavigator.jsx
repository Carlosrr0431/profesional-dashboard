import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuthStore } from '../stores/authStore';
import { useNavigationPersistence } from '../hooks/useNavigationPersistence';
import { navigationRef } from './navigationRef';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import AppSplashScreen from '../components/ui/AppSplashScreen';

export default function AppNavigator() {
  const { hasProfile, isLoading } = useAuthStore();
  const {
    showNavigation,
    showLoadingOverlay,
    navigationInitialState,
    onNavigationStateChange,
  } = useNavigationPersistence({
    isAuthed: hasProfile,
    isLoading,
  });

  return (
    <View style={styles.root}>
      {showNavigation ? (
        <NavigationContainer
          ref={navigationRef}
          initialState={navigationInitialState}
          onStateChange={onNavigationStateChange}
        >
          {hasProfile ? <MainNavigator /> : <AuthNavigator />}
        </NavigationContainer>
      ) : null}
      {showLoadingOverlay ? (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <AppSplashScreen />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
});
