import { getMessagingInstance } from './firebaseMessaging';

const messaging = getMessagingInstance();

if (messaging) {
  const { setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
  setBackgroundMessageHandler(messaging, async () => {
    // Con payload `notification`, Android/iOS muestran la alerta en segundo plano.
  });
} else {
  console.warn(
    'FCM nativo no encontrado en este APK. Corré: cd passenger-app && npm run rebuild:android'
  );
}
