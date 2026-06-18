import { useEffect } from 'react';
import { AppState } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  registerForPushNotifications,
  subscribeToTokenRefresh,
  subscribeToForegroundMessages,
  subscribeToNotificationOpen,
  extractNotificationData,
} from '../services/notifications';
import { useAuthStore } from '../stores/authStore';
import { navigate } from '../navigation/navigationRef';

const globalScope = globalThis;

const getRuntime = () => {
  if (!globalScope.__passengerNotifRuntime) {
    globalScope.__passengerNotifRuntime = {
      foregroundSub: null,
      openSub: null,
      tokenRefreshSub: null,
      appStateSub: null,
    };
  }
  return globalScope.__passengerNotifRuntime;
};

/**
 * Hook raíz para notificaciones push del pasajero (solo FCM).
 */
export const useNotifications = () => {
  const { profile } = useAuthStore();

  useEffect(() => {
    if (!profile?.phone) return undefined;

    const runtime = getRuntime();
    const auth = {
      phone: profile.phone,
      sessionToken: profile.sessionToken || null,
    };

    const registerPush = () => {
      registerForPushNotifications(auth).catch(console.warn);
    };

    registerPush();

    runtime.tokenRefreshSub?.remove?.();
    runtime.tokenRefreshSub = subscribeToTokenRefresh(auth);

    runtime.foregroundSub?.remove?.();
    runtime.foregroundSub = subscribeToForegroundMessages((remoteMessage) => {
      const title = remoteMessage.notification?.title;
      const body = remoteMessage.notification?.body;
      if (!title && !body) return;

      Toast.show({
        type: 'info',
        text1: title || 'Notificación',
        text2: body || '',
        visibilityTime: 4000,
      });
    });

    runtime.openSub?.remove?.();
    runtime.openSub = subscribeToNotificationOpen((remoteMessage) => {
      const data = extractNotificationData(remoteMessage);
      if (data?.screen === 'ActiveTrip' || data?.type === 'trip_status') {
        navigate('ActiveTrip');
      }
    });

    runtime.appStateSub?.remove?.();
    runtime.appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        registerPush();
      }
    });

    return () => {
      runtime.foregroundSub?.remove?.();
      runtime.foregroundSub = null;
      runtime.openSub?.remove?.();
      runtime.openSub = null;
      runtime.tokenRefreshSub?.remove?.();
      runtime.tokenRefreshSub = null;
      runtime.appStateSub?.remove?.();
      runtime.appStateSub = null;
    };
  }, [profile?.phone, profile?.sessionToken]);
};
