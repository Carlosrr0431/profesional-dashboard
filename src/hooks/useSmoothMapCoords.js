import { useEffect, useRef, useState } from 'react';
import { haversineMeters, pinMoveDurationMs } from '../lib/driverMapGps';

const SNAP_METERS = 420;

export function useSmoothMapCoords(lat, lng, speedMps = 0) {
  const [display, setDisplay] = useState({ lat, lng });
  const displayRef = useRef({ lat, lng });
  const bootRef = useRef(true);
  const animRef = useRef(0);

  useEffect(() => {
    const target = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return undefined;

    if (bootRef.current) {
      bootRef.current = false;
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const from = displayRef.current;
    const dist = haversineMeters(from.lat, from.lng, target.lat, target.lng);
    if (dist < 0.7 || dist > SNAP_METERS) {
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const duration = pinMoveDurationMs(dist, speedMps);
    const started = performance.now();
    cancelAnimationFrame(animRef.current);

    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - t) ** 2;
      const next = {
        lat: from.lat + (target.lat - from.lat) * eased,
        lng: from.lng + (target.lng - from.lng) * eased,
      };
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [lat, lng, speedMps]);

  return display;
}
