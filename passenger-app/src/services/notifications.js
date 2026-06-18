import { PermissionsAndroid, Platform } from 'react-native';
import { supabase } from './supabase';
import { getPassengerPhoneVariants } from '../utils/phone';
import { getFirebaseMessaging } from './firebaseMessaging';
import { registerPassengerPushToken } from './authService';

const savePassengerPushTokenDirect = async (phone, token) => {
  const variants = getPassengerPhoneVariants(phone);
  if (!variants.length || !token) return { ok: false };

  const now = new Date().toISOString();
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
        console.log(`Push sincronizados tras registro: ${apiResult.syncedPushes}`);
      }
      return { ok: true, via: 'api' };
    }

    console.warn('API register-push-token falló:', apiResult.message);
  }

  const directResult = await savePassengerPushTokenDirect(phone, token);
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
    await messaging().registerDeviceForRemoteMessages();
    const authorizationStatus = await messaging().requestPermission();
    return (
      authorizationStatus === messaging.AuthorizationStatus.AUTHORIZED
      || authorizationStatus === messaging.AuthorizationStatus.PROVISIONAL
    );
  }

  return true;
}

export const registerForPushNotifications = async ({ phone, sessionToken } = {}) => {
  const passengerPhone = String(phone || '').trim();
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.warn('Firebase Messaging no disponible (rebuild nativo requerido)');
    return null;
  }

  try {
    const granted = await requestNotificationPermission(messaging);
    if (!granted) {
      console.log('Permiso de notificaciones denegado');
      return null;
    }

    const token = await messaging().getToken();
    if (!token) {
      console.warn('No se pudo obtener el token FCM');
      return null;
    }

    console.log('Token FCM pasajero registrado:', `${token.slice(0, 18)}...`);

    if (passengerPhone) {
      const saveResult = await persistPassengerPushToken({
        phone: passengerPhone,
        sessionToken,
        token,
      });
      if (!saveResult.ok) {
        console.warn('No se pudo guardar el push_token del pasajero');
      }
    }

    return token;
  } catch (error) {
    console.warn('Push notification registration failed:', error);
    return null;
  }
};

export const subscribeToTokenRefresh = ({ phone, sessionToken } = {}) => {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { remove: () => {} };
  }

  const unsubscribe = messaging().onTokenRefresh(async (token) => {
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
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { remove: () => {} };
  }

  const unsubscribe = messaging().onMessage(handler);
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
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { remove: () => {} };
  }

  const unsubscribeOpened = messaging().onNotificationOpenedApp(handler);

  messaging()
    .getInitialNotification()
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
