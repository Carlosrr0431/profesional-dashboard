import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuthStore } from '../stores/authStore';
import { navigationRef } from './navigationRef';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import AppSplashScreen from '../components/ui/AppSplashScreen';
import { colors } from '../theme/colors';

export default function AppNavigator() {
  const { hasProfile, isLoading } = useAuthStore();

  if (isLoading) {
    return <AppSplashScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {hasProfile ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
