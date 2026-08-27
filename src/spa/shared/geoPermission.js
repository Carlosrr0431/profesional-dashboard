'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useGeoPermission({ watch = false, enabled = true } = {}) {
  const [status, setStatus] = useState('unknown');
  const [coords, setCoords] = useState(null);
  const watchRef = useRef(null);

  const applyPosition = useCallback((pos) => {
    setStatus('granted');
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  }, []);

  const applyError = useCallback((err) => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    if (err?.code === 1) setStatus('denied');
    else setStatus((prev) => (prev === 'granted' ? prev : 'prompt'));
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(applyPosition, applyError, {
      enableHighAccuracy: true,
      timeout: 12000,
    });
  }, [applyPosition, applyError]);

  const startWatch = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(applyPosition, applyError, {
      enableHighAccuracy: true,
      maximumAge: 4000,
    });
  }, [applyPosition, applyError]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof navigator === 'undefined') return undefined;
    if (!navigator.geolocation) {
      setStatus('unavailable');
      return undefined;
    }

    let permission = null;
    const sync = (state) => {
      if (state === 'granted') {
        if (watch) startWatch();
        else request();
      } else if (state === 'denied') setStatus('denied');
      else setStatus('prompt');
    };

    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        navigator.permissions.query({ name: 'geolocation' })
          .then((result) => {
            permission = result;
            sync(result.state);
            result.onchange = () => sync(result.state);
          })
          .catch(() => {
            if (watch) startWatch();
            else request();
          });
      } catch {
        if (watch) startWatch();
        else request();
      }
    } else if (watch) {
      startWatch();
    } else {
      request();
    }

    return () => {
      if (permission) permission.onchange = null;
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [request, startWatch, watch, enabled]);

  return {
    status,
    coords,
    request,
    startWatch,
    showBanner: status === 'denied' || status === 'unavailable' || status === 'prompt',
  };
}
