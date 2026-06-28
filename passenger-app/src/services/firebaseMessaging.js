import { NativeModules } from 'react-native';

let cachedMessaging = null;

export function isFirebaseNativeAvailable() {
  try {
    return Boolean(NativeModules.RNFBAppModule);
  } catch {
    return false;
  }
}

export function getMessagingInstance() {
  if (!isFirebaseNativeAvailable()) return null;
  if (cachedMessaging) return cachedMessaging;

  try {
    const { getApp } = require('@react-native-firebase/app');
    const { getMessaging } = require('@react-native-firebase/messaging');
    cachedMessaging = getMessaging(getApp());
    return cachedMessaging;
  } catch (error) {
    console.warn('Firebase Messaging no disponible:', error?.message || error);
    return null;
  }
}

export function getMessagingModular() {
  if (!getMessagingInstance()) return null;
  try {
    return require('@react-native-firebase/messaging');
  } catch (error) {
    console.warn('Firebase Messaging modular no disponible:', error?.message || error);
    return null;
  }
}

/** @deprecated Usar getMessagingInstance() */
export function getFirebaseMessaging() {
  return getMessagingInstance();
}
