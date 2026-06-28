import './src/bootstrap/reanimatedBootstrap';
import './src/services/notificationsBackground';
import 'react-native-gesture-handler';
import React, { useEffect, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore, isSessionValid } from './src/stores/authStore';
import { normalizePassengerPhone } from './src/utils/phone';
import { validatePassengerSession } from './src/services/authService';
import { useNotifications } from './src/hooks/useNotifications';

SplashScreen.preventAutoHideAsync();

function RootApp() {
  useNotifications();
  return <AppNavigator />;
}

export default function App() {
  const { setProfile, setLoading, clearProfile, saveProfile } = useAuthStore();
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    async function loadProfile() {
      try {
        const raw = await AsyncStorage.getItem('@passenger_profile');
        if (!raw) return;

        const parsed = JSON.parse(raw);
        const phone = normalizePassengerPhone(parsed?.phone);
        const sessionToken = String(parsed?.sessionToken || '').trim();

        if (!phone || !sessionToken) {
          await clearProfile();
          return;
        }

        const localProfile = {
          ...parsed,
          phone,
          sessionToken,
        };

        if (!isSessionValid(localProfile)) {
          await clearProfile();
          return;
        }

        const remote = await validatePassengerSession(phone, sessionToken);
        if (remote.ok) {
          await saveProfile({
            phone: remote.phone,
            sessionToken: remote.sessionToken,
            sessionExpiresAt: remote.sessionExpiresAt,
            name: remote.name || parsed.name || 'Pasajero',
          });
        } else if (remote.expired) {
          await clearProfile();
        } else {
          setProfile(localProfile);
        }
      } catch (e) {
        console.error('Error cargando perfil:', e);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const hideSplash = useCallback(async () => {
    if ((fontsLoaded || fontError) && !isAuthLoading) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isAuthLoading]);

  useEffect(() => {
    hideSplash();
  }, [hideSplash]);

  const onLayoutRootView = useCallback(() => {
    hideSplash();
  }, [hideSplash]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <RootApp />
        <Toast position="top" topOffset={60} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
