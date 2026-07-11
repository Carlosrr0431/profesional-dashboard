import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState, InteractionManager } from 'react-native';
import * as Location from 'expo-location';

const DEFAULT_LOCATION = { latitude: -24.7829, longitude: -65.4122 };
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutos
const FRESH_POSITION_TIMEOUT_MS = 10_000;

const runtime = globalThis.__passengerLocationRuntime ??= {
  location: null,
  permissionStatus: null,
  isLoading: true,
  watchRef: null,
  initPromise: null,
  permissionPromise: null,
  listeners: new Set(),
};

let cachedSnapshot = {
  location: runtime.location,
  permissionStatus: runtime.permissionStatus,
  isLoading: runtime.isLoading,
};

function notifyListeners() {
  runtime.listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

function getSnapshot() {
  if (
    cachedSnapshot.location !== runtime.location
    || cachedSnapshot.permissionStatus !== runtime.permissionStatus
    || cachedSnapshot.isLoading !== runtime.isLoading
  ) {
    cachedSnapshot = {
      location: runtime.location,
      permissionStatus: runtime.permissionStatus,
      isLoading: runtime.isLoading,
    };
  }
  return cachedSnapshot;
}

function coordsFromPosition(pos) {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

async function waitForPermissionDialogReady() {
  const afterInteractions = () =>
    new Promise((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });

  if (AppState.currentState === 'active') {
    await afterInteractions();
    return;
  }

  await new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        sub.remove();
        afterInteractions().then(resolve);
      }
    });
  });
}

async function requestPermissionsInternal() {
  if (runtime.permissionPromise) {
    return runtime.permissionPromise;
  }

  runtime.permissionPromise = (async () => {
    try {
      await waitForPermissionDialogReady();

      const { status: current } = await Location.getForegroundPermissionsAsync();
      if (current === 'granted') {
        runtime.permissionStatus = 'granted';
        notifyListeners();
        return true;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      runtime.permissionStatus = status;
      notifyListeners();
      return status === 'granted';
    } catch {
      return false;
    } finally {
      runtime.permissionPromise = null;
    }
  })();

  return runtime.permissionPromise;
}

async function fetchCurrentLocation() {
  const granted = await requestPermissionsInternal();
  if (!granted) {
    runtime.location = DEFAULT_LOCATION;
    runtime.isLoading = false;
    notifyListeners();
    return DEFAULT_LOCATION;
  }

  try {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
    }).catch(() => null);

    if (lastKnown) {
      runtime.location = coordsFromPosition(lastKnown);
      runtime.isLoading = false;
      notifyListeners();
    }

    const freshPos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('location_timeout')), FRESH_POSITION_TIMEOUT_MS)
      ),
    ]);

    const loc = coordsFromPosition(freshPos);
    runtime.location = loc;
    runtime.isLoading = false;
    notifyListeners();
    return loc;
  } catch {
    runtime.location = runtime.location ?? DEFAULT_LOCATION;
    runtime.isLoading = false;
    notifyListeners();
    return runtime.location ?? DEFAULT_LOCATION;
  }
}

async function startWatchingInternal() {
  if (runtime.watchRef) return;

  const granted = await requestPermissionsInternal();
  if (!granted) return;

  try {
    runtime.watchRef = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 15,
      },
      (pos) => {
        runtime.location = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        notifyListeners();
      }
    );
  } catch (e) {
    console.error('Error iniciando seguimiento de ubicación:', e);
  }
}

function stopWatchingInternal() {
  if (runtime.watchRef) {
    runtime.watchRef.remove();
    runtime.watchRef = null;
  }
}

async function bootstrapLocation() {
  if (runtime.initPromise) {
    return runtime.initPromise;
  }

  runtime.initPromise = (async () => {
    await fetchCurrentLocation();
    await startWatchingInternal();
  })();

  return runtime.initPromise;
}

/** Espera a que termine el primer pedido de permiso/ubicación (para no competir con notificaciones). */
export function whenLocationBootstrapSettled() {
  return bootstrapLocation().catch(() => {});
}

export const useLocation = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    bootstrapLocation();
    return () => {};
  }, []);

  const requestPermissions = useCallback(() => requestPermissionsInternal(), []);

  const getCurrentLocation = useCallback(async () => {
    const loc = await fetchCurrentLocation();
    await startWatchingInternal();
    return loc;
  }, []);

  const startWatching = useCallback(async () => {
    await startWatchingInternal();
  }, []);

  const stopWatching = useCallback(() => {
    stopWatchingInternal();
  }, []);

  return {
    location: snapshot.location || DEFAULT_LOCATION,
    permissionStatus: snapshot.permissionStatus,
    isLoading: snapshot.isLoading,
    requestPermissions,
    getCurrentLocation,
    startWatching,
    stopWatching,
  };
};
