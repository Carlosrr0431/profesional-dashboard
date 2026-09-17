import { useEffect, useRef, useState } from 'react';
import { haversineMeters, pinMoveDurationMs } from '../lib/driverMapGps';

// Frame throttling para ~60 FPS
const FRAME_MS = 16;
const DEFAULT_LERP_MS = 750;
const MIN_LERP_MS = 200;
const MAX_LERP_MS = 1400;

/**
 * Curva de desaceleración cúbica (ease-out cubic):
 * Inicia a velocidad uniforme y desacelera suavemente al llegar al destino.
 * Comportamiento idéntico al marcador de Uber o Google Maps.
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * useSmoothMapCoords
 *
 * Mueve fluidamente el pin de cada chofer desde su posición visible actual
 * hasta la nueva posición reportada por GPS / Realtime, sin titileos ni
 * saltos abruptos.
 *
 * Elimina la extrapolación a futuro (dead-reckoning) que hacía que el pin
 * apareciera adelantado en esquinas y luego retrocediera de golpe (ping-pong).
 *
 * Se detiene completamente una vez alcanzado el objetivo (cero costo de CPU
 * en reposo), lo que permite escalar a 40+ o más choferes simultáneos.
 */
export function useSmoothMapCoords(lat, lng, speedMps = 0, headingDeg = 0) {
  const [display, setDisplay] = useState({ lat, lng });
  const displayRef = useRef({ lat, lng });
  const bootRef = useRef(true);
  const animRef = useRef(0);
  const lastPaintRef = useRef(0);

  useEffect(() => {
    const target = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return undefined;
    if (target.lat === 0 && target.lng === 0) return undefined;

    // Primer render: posicionar el pin de inmediato sin animar
    if (bootRef.current) {
      bootRef.current = false;
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const start = displayRef.current;
    const distM = haversineMeters(start.lat, start.lng, target.lat, target.lng);

    // Si el movimiento es casi nulo (< 0.6 m), mantener posición
    if (distM < 0.6) {
      return undefined;
    }

    // Si es un salto grande (> 800 m, ej. reconnect inicial o teleport), posicionar directo
    if (distM > 800) {
      cancelAnimationFrame(animRef.current);
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    // Cancelar animación anterior si estaba en curso
    cancelAnimationFrame(animRef.current);
    lastPaintRef.current = 0;

    // Duración de la transición suave: proporcional a velocidad/distancia
    const speed = Number(speedMps) || 0;
    const dynamicMs = pinMoveDurationMs(distM, speed);
    const duration = Math.min(MAX_LERP_MS, Math.max(MIN_LERP_MS, dynamicMs || DEFAULT_LERP_MS));

    const startTime = performance.now();
    const startLat = start.lat;
    const startLng = start.lng;

    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = easeOutCubic(t);

      const curLat = startLat + (target.lat - startLat) * ease;
      const curLng = startLng + (target.lng - startLng) * ease;

      if (now - lastPaintRef.current >= FRAME_MS || t >= 1) {
        lastPaintRef.current = now;
        displayRef.current = { lat: curLat, lng: curLng };
        setDisplay({ lat: curLat, lng: curLng });
      }

      // Continuar animando hasta llegar exactamente al objetivo; luego detenerse (sin extrapolation)
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [lat, lng, speedMps, headingDeg]);

  return display;
}
