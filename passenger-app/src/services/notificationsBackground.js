import { getFirebaseMessaging } from './firebaseMessaging';

const messaging = getFirebaseMessaging();

if (messaging) {
  messaging().setBackgroundMessageHandler(async () => {
    // Con payload `notification`, Android/iOS muestran la alerta en segundo plano.
  });
} else {
  console.warn(
    'FCM nativo no encontrado en este APK. Corré: cd passenger-app && npm run rebuild:android'
  );
}
