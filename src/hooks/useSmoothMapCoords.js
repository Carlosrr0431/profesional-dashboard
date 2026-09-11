import { useEffect, useRef, useState } from 'react';
import {
  extrapolateGps,
  inferPinMotion,
  MAX_GPS_EXTRAPOLATE_MS,
  MIN_MOVE_SPEED_MPS,
} from '../lib/driverMapGps';

const FRAME_MS = 33;

export function useSmoothMapCoords(lat, lng, speedMps = 0, headingDeg = 0) {
  const [display, setDisplay] = useState({ lat, lng });
  const displayRef = useRef({ lat, lng });
  const fixRef = useRef({
    lat,
    lng,
    speed: speedMps,
    heading: headingDeg,
    at: 0,
  });
  const bootRef = useRef(true);
  const animRef = useRef(0);
  const lastPaintRef = useRef(0);

  useEffect(() => {
    const target = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return undefined;

    const now = performance.now();
    const prevFix = fixRef.current;
    const coordsChanged = prevFix.lat !== target.lat || prevFix.lng !== target.lng;

    if (bootRef.current) {
      bootRef.current = false;
      fixRef.current = {
        ...target,
        speed: Number(speedMps) || 0,
        heading: Number(headingDeg) || 0,
        at: now,
      };
      displayRef.current = target;
      setDisplay(target);
    } else if (coordsChanged) {
      const intervalMs = prevFix.at ? now - prevFix.at : 0;
      const motion = inferPinMotion({
        fromLat: prevFix.lat,
        fromLng: prevFix.lng,
        toLat: target.lat,
        toLng: target.lng,
        reportedSpeed: speedMps,
        reportedHeading: headingDeg,
        intervalMs,
      });
      fixRef.current = {
        ...target,
        speed: motion.speed,
        heading: motion.heading,
        at: now,
      };
      displayRef.current = target;
      setDisplay(target);
    } else {
      fixRef.current = {
        lat: displayRef.current.lat,
        lng: displayRef.current.lng,
        speed: Number(speedMps) || 0,
        heading: Number(headingDeg) || 0,
        at: now,
      };
    }

    cancelAnimationFrame(animRef.current);
    lastPaintRef.current = 0;

    const tick = (t) => {
      const fix = fixRef.current;
      const elapsed = t - fix.at;
      const next = extrapolateGps(fix.lat, fix.lng, fix.speed, fix.heading, elapsed);
      if (t - lastPaintRef.current >= FRAME_MS) {
        lastPaintRef.current = t;
        if (next.lat !== displayRef.current.lat || next.lng !== displayRef.current.lng) {
          displayRef.current = next;
          setDisplay(next);
        }
      }
      if (elapsed < MAX_GPS_EXTRAPOLATE_MS && Number(fix.speed) >= MIN_MOVE_SPEED_MPS) {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [lat, lng, speedMps, headingDeg]);

  return display;
}
