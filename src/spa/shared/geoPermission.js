'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useGeoPermission({ watch = false, enabled = true } = {}) {
  const [status, setStatus] = useState('unknown');
  const [coords, setCoords] = useState(null);
  const watchRef = useRef(null);

  const lastPosRef = useRef(null);

  const applyPosition = useCallback((pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    let heading = Number(pos.coords.heading);
    const prev = lastPosRef.current;
    if (!Number.isFinite(heading) || heading < 0) {
      if (prev && (Math.abs(prev.lat - lat) > 0.00002 || Math.abs(prev.lng - lng) > 0.00002)) {
        const lat1 = (prev.lat * Math.PI) / 180;
        const lat2 = (lat * Math.PI) / 180;
        const dLng = ((lng - prev.lng) * Math.PI) / 180;
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        heading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      } else {
        heading = prev?.heading ?? 0;
      }
    }
    const next = {
      lat,
      lng,
      heading,
      speed: Number(pos.coords.speed) > 0 ? Number(pos.coords.speed) : 0,
    };
    lastPosRef.current = next;
    setStatus('granted');
    setCoords(next);
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
