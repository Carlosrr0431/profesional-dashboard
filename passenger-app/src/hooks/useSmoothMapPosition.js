import { useEffect, useRef, useState } from 'react';
import { lerpCoordinate } from '../utils/routeMapUtils';

const DEFAULT_MS = 1100;

/**
 * Interpola suavemente entre posiciones GPS para el marcador en el mapa.
 */
export function useSmoothMapPosition(target, durationMs = DEFAULT_MS) {
  const [display, setDisplay] = useState(null);
  const frameRef = useRef(null);
  const fromRef = useRef(null);

  useEffect(() => {
    if (!target?.latitude || !target?.longitude) {
      setDisplay(null);
      fromRef.current = null;
      return undefined;
    }

    if (!display) {
      setDisplay(target);
      fromRef.current = target;
      return undefined;
    }

    const from = display;
    fromRef.current = from;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(lerpCoordinate(from, target, eased));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target?.latitude, target?.longitude, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return display ?? target;
}
