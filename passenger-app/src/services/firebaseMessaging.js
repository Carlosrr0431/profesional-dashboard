import { NativeModules } from 'react-native';

export function isFirebaseNativeAvailable() {
  try {
    return Boolean(NativeModules.RNFBAppModule);
  } catch {
    return false;
  }
}

export function getFirebaseMessaging() {
  if (!isFirebaseNativeAvailable()) return null;
  try {
    return require('@react-native-firebase/messaging').default;
  } catch (error) {
    console.warn('Firebase Messaging no disponible:', error?.message || error);
    return null;
  }
}
