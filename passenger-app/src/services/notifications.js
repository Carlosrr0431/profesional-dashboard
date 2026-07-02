import { PermissionsAndroid, Platform } from 'react-native';
import { supabase } from './supabase';
import { getPassengerPhoneVariants } from '../utils/phone';
import { getMessagingInstance } from './firebaseMessaging';
import { registerPassengerPushToken } from './authService';

const savePassengerPushTokenDirect = async (phone, token) => {
  const variants = getPassengerPhoneVariants(phone);
  if (!variants.length || !token) return { ok: false };

  const now = new Date().toISOString();

  // 1) passenger_auth_sessions: solo actualiza filas existentes (no crea sesiones nuevas)
  await Promise.allSettled(
    variants.map((variantPhone) =>
      supabase
        .from('passenger_auth_sessions')
        .update({ push_token: token, updated_at: now })
        .eq('phone', variantPhone)
    )
  );

  // 2) passenger_devices: upsert legacy (fallback para el servidor)
  const rows = variants.map((variantPhone) => ({
    phone: variantPhone,
    push_token: token,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('passenger_devices')
    .upsert(rows, { onConflict: 'phone' });

  if (error) {
    console.warn('Fallback Supabase push_token:', error.message || error);
    return { ok: false, error };
  }

  return { ok: true };
};

const persistPassengerPushToken = async ({ phone, sessionToken, token }) => {
  if (sessionToken) {
    const apiResult = await registerPassengerPushToken({
      phone,
      sessionToken,
      pushToken: token,
    });

    if (apiResult.ok) {
      if (apiResult.syncedPushes > 0) {
        console.log(`[PassengerPush] Push sincronizados tras registro: ${apiResult.syncedPushes}`);
      }
      return { ok: true, via: 'api' };
    }

    console.warn('[PassengerPush] API register-push-token falló (usando fallback Supabase):', apiResult.message);
  }

  const directResult = await savePassengerPushTokenDirect(phone, token);
  if (directResult.ok) {
    console.log('[PassengerPush] Token guardado via Supabase anon directamente.');
  } else {
    console.warn('[PassengerPush] Falló el guardado directo en Supabase:', directResult.error?.message);
  }
  return { ok: directResult.ok, via: 'supabase' };
};

async function requestAndroidNotificationPermission() {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;

  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('Error solicitando POST_NOTIFICATIONS:', error?.message || error);
    return false;
  }
}

async function requestNotificationPermission(messaging) {
  if (Platform.OS === 'android') {
    return requestAndroidNotificationPermission();
  }

  if (Platform.OS === 'ios') {
    const {
      registerDeviceForRemoteMessages,
      requestPermission,
      AuthorizationStatus,
    } = require('@react-native-firebase/messaging');

    await registerDeviceForRemoteMessages(messaging);
    const authorizationStatus = await requestPermission(messaging);
    return (
      authorizationStatus === AuthorizationStatus.AUTHORIZED
      || authorizationStatus === AuthorizationStatus.PROVISIONAL
    );
  }

  return true;
}

export const registerForPushNotifications = async ({ phone, sessionToken } = {}) => {
  const passengerPhone = String(phone || '').trim();
  const messaging = getMessagingInstance();
  if (!messaging) {
    console.warn(
      '[PassengerPush] Firebase Messaging no disponible. ' +
      'Rebuild necesario: cd passenger-app && npm run start:android:install'
    );
    return null;
  }

  try {
    const granted = await requestNotificationPermission(messaging);
    if (!granted) {
      console.warn('[PassengerPush] Permiso de notificaciones denegado por el usuario.');
      return null;
    }

    const { getToken } = require('@react-native-firebase/messaging');
    const token = await getToken(messaging);
    if (!token) {
      console.warn('[PassengerPush] No se pudo obtener el token FCM de Firebase.');
      return null;
    }

    console.log('[PassengerPush] Token FCM obtenido:', `${token.slice(0, 20)}...`);

    if (passengerPhone) {
      const saveResult = await persistPassengerPushToken({
        phone: passengerPhone,
        sessionToken,
        token,
      });
      if (saveResult.ok) {
        console.log('[PassengerPush] Token guardado correctamente. Via:', saveResult.via);
      } else {
        console.warn(
          '[PassengerPush] No se pudo guardar el token FCM.',
          'Teléfono:', passengerPhone ? `${passengerPhone.slice(0, 5)}...` : 'vacío',
          'Via:', saveResult.via || 'desconocida'
        );
      }
    } else {
      console.warn('[PassengerPush] Token obtenido pero sin teléfono de pasajero para asociarlo.');
    }

    return token;
  } catch (error) {
    console.warn('[PassengerPush] Error en registro:', error?.message || error);
    return null;
  }
};

export const subscribeToTokenRefresh = ({ phone, sessionToken } = {}) => {
  const messaging = getMessagingInstance();
  if (!messaging) {
    return { remove: () => {} };
  }

  const { onTokenRefresh } = require('@react-native-firebase/messaging');
  const unsubscribe = onTokenRefresh(messaging, async (token) => {
    if (!phone || !token) return;
    try {
      await persistPassengerPushToken({ phone, sessionToken, token });
    } catch (e) {
      console.warn('Token refresh update failed:', e);
    }
  });

  return {
    remove: () => {
      try {
        unsubscribe();
      } catch (e) {
        console.warn('Token refresh unsubscribe failed:', e);
      }
    },
  };
};

export const subscribeToForegroundMessages = (handler) => {
  const messaging = getMessagingInstance();
  if (!messaging) {
    return { remove: () => {} };
  }

  const { onMessage } = require('@react-native-firebase/messaging');
  const unsubscribe = onMessage(messaging, handler);
  return {
    remove: () => {
      try {
        unsubscribe();
      } catch (e) {
        console.warn('Foreground message unsubscribe failed:', e);
      }
    },
  };
};

export const subscribeToNotificationOpen = (handler) => {
  const messaging = getMessagingInstance();
  if (!messaging) {
    return { remove: () => {} };
  }

  const { onNotificationOpenedApp, getInitialNotification } = require('@react-native-firebase/messaging');
  const unsubscribeOpened = onNotificationOpenedApp(messaging, handler);

  getInitialNotification(messaging)
    .then((remoteMessage) => {
      if (remoteMessage) handler(remoteMessage);
    })
    .catch((error) => {
      console.warn('getInitialNotification failed:', error?.message || error);
    });

  return {
    remove: () => {
      try {
        unsubscribeOpened();
      } catch (e) {
        console.warn('Notification open unsubscribe failed:', e);
      }
    },
  };
};

export const extractNotificationData = (remoteMessage) => remoteMessage?.data || {};
