import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as ExpoInAppUpdates from 'expo-in-app-updates';

const PLAY_STORE_PACKAGE = 'com.remises.passengerapp';

async function openPlayStore() {
  const marketUrl = `market://details?id=${PLAY_STORE_PACKAGE}`;
  const webUrl = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;
  try {
    const canOpen = await Linking.canOpenURL(marketUrl);
    await Linking.openURL(canOpen ? marketUrl : webUrl);
  } catch {
    await Linking.openURL(webUrl);
  }
}

/**
 * Detecta actualizaciones publicadas en Google Play (API nativa).
 * No altera lógica de negocio: solo UI de aviso.
 */
export function useStoreUpdateCheck() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web') return undefined;

    let cancelled = false;

    const run = async () => {
      try {
        const result = await ExpoInAppUpdates.checkForUpdate();
        if (!cancelled && result?.updateAvailable) {
          setVisible(true);
        }
      } catch {
        // Silencioso: sin Play Store / emulador / red no debe romper la app.
      }
    };

    const timer = setTimeout(run, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const openUpdate = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const started = await ExpoInAppUpdates.startUpdate(false);
        if (started) {
          setVisible(false);
          return;
        }
      }
      await openPlayStore();
    } catch {
      try {
        await openPlayStore();
      } catch {
        // ignore
      }
    } finally {
      setVisible(false);
    }
  }, []);

  return { visible, dismiss, openUpdate };
}
