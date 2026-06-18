import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

const DEFAULT_LOCATION = { latitude: -24.7829, longitude: -65.4122 };

export const useLocation = () => {
  const [location, setLocation] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const watchRef = useRef(null);

  const requestPermissions = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      return status === 'granted';
    } catch {
      return false;
    }
  }, []);

  const getCurrentLocation = useCallback(async () => {
    try {
      const granted = await requestPermissions();
      if (!granted) {
        setLocation(DEFAULT_LOCATION);
        setIsLoading(false);
        return DEFAULT_LOCATION;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
      });

      const loc = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      setLocation(loc);
      setIsLoading(false);
      return loc;
    } catch {
      setLocation(DEFAULT_LOCATION);
      setIsLoading(false);
      return DEFAULT_LOCATION;
    }
  }, [requestPermissions]);

  const startWatching = useCallback(async () => {
    if (watchRef.current) return;
    try {
      const granted = await requestPermissions();
      if (!granted) return;

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 15,
        },
        (pos) => {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        }
      );
    } catch (e) {
      console.error('Error iniciando seguimiento de ubicación:', e);
    }
  }, [requestPermissions]);

  const stopWatching = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
  }, []);

  useEffect(() => {
    getCurrentLocation();
    return () => stopWatching();
  }, []);

  return {
    location: location || DEFAULT_LOCATION,
    permissionStatus,
    isLoading,
    requestPermissions,
    getCurrentLocation,
    startWatching,
    stopWatching,
  };
};
