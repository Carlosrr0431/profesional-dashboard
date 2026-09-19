import { useEffect, useRef, useState } from 'react';
import {
  bearingDegrees,
  extrapolateGps,
  haversineMeters,
  MAX_GPS_EXTRAPOLATE_MS,
  MIN_MOVE_SPEED_MPS,
  shouldAcceptForwardGpsStep,
} from '../lib/driverMapGps';

const FRAME_MS = 16;
const DEFAULT_DURATION_MS = 1000;
const MIN_DURATION_MS = 400;
const MAX_DURATION_MS = 2200;

/**
 * useSmoothMapCoords
 *
 * Mueve fluidamente el pin de cada chofer desde su posición visible actual
 * hasta la nueva posición reportada por GPS / Realtime, con movimiento uniforme
 * y continuo estilo Uber / Google Maps (sin aceleraciones bruscas, sin frenazos,
 * y sin retrocesos).
 *
 * Mejoras clave:
 * 1. Movimiento uniforme continuo (velocidad constante entre coordenadas consecutivas).
 * 2. Cadencia adaptativa: ajusta la duración del deslizamiento al ritmo real con el que
 *    el celular emite los puntos (ej. 1s - 1.5s), garantizando que el auto nunca se
 *    quede "congelado" esperando la siguiente señal.
 * 3. Handover fluido: si llega un nuevo punto mientras el pin está en camino, la nueva
 *    animación parte exactamente de las coordenadas donde se encuentra en pantalla,
 *    sin saltos ni tirones.
 * 4. Filtro de micro-ruido estacionario (< 0.8m con auto detenido).
 * 5. Salto instantáneo en reconexiones / teletransportes (> 500m).
 * 6. 0% de CPU en reposo una vez que el auto se detiene por completo.
 */
export function useSmoothMapCoords(lat, lng, speedMps = 0, headingDeg = 0) {
  const [display, setDisplay] = useState({ lat, lng });
  const displayRef = useRef({ lat, lng });
  const bootRef = useRef(true);
  const animRef = useRef(0);
  const lastPaintRef = useRef(0);
  const lastTargetTimeRef = useRef(0);
  const courseRef = useRef(Number(headingDeg) || 0);

  useEffect(() => {
    const target = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return undefined;
    if (target.lat === 0 && target.lng === 0) return undefined;

    // Primer render: posicionar el pin de inmediato sin animar
    if (bootRef.current) {
      bootRef.current = false;
      displayRef.current = target;
      setDisplay(target);
      lastTargetTimeRef.current = performance.now();
      if (Number.isFinite(Number(headingDeg))) courseRef.current = Number(headingDeg);
      return undefined;
    }

    const start = displayRef.current;
    const distM = haversineMeters(start.lat, start.lng, target.lat, target.lng);

    // Micro-movimiento / jitter de GPS quieto (< 0.8 m)
    if (distM < 0.8) {
      return undefined;
    }

    const reportedHeading = Number(headingDeg);
    const course = Number.isFinite(reportedHeading) && reportedHeading !== 0
      ? reportedHeading
      : courseRef.current;

    // Punto hacia atrás respecto del pin YA DIBUJADO (a menudo adelantado por
    // coasting): no animar atrás. Frenar el coast para que el GPS alcance.
    if (!shouldAcceptForwardGpsStep({
      fromLat: start.lat,
      fromLng: start.lng,
      toLat: target.lat,
      toLng: target.lng,
      headingDeg: course,
      speedMps,
    })) {
      cancelAnimationFrame(animRef.current);
      return undefined;
    }

    // Salto grande (> 500 m, ej. reconexión inicial o teleport): posicionar directo
    if (distM > 500) {
      cancelAnimationFrame(animRef.current);
      displayRef.current = target;
      setDisplay(target);
      lastTargetTimeRef.current = performance.now();
      return undefined;
    }

    // Cancelar animación anterior si estaba en curso (handover suave desde posición visible actual)
    cancelAnimationFrame(animRef.current);
    lastPaintRef.current = 0;

    const now = performance.now();
    const lastTargetTime = lastTargetTimeRef.current;
    lastTargetTimeRef.current = now;

    // Calcular cadencia real entre señales GPS recibidas
    const timeDelta = lastTargetTime ? (now - lastTargetTime) : DEFAULT_DURATION_MS;
    const speed = Number(speedMps) || 0;

    // Duración adaptativa: calculada según el intervalo real de emisión y la velocidad
    let duration = DEFAULT_DURATION_MS;
    if (timeDelta > 200 && timeDelta < 3000) {
      // Usar el intervalo real + 5% de buffer para que el pin siga deslizándose fluidamente
      // hasta que entre el siguiente paquete de GPS, eliminando pausas/congelamientos
      duration = timeDelta * 1.05;
    } else if (speed > 1.0) {
      duration = (distM / speed) * 1000;
    }
    duration = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, duration));

    if (distM >= 1) {
      courseRef.current = bearingDegrees(start.lat, start.lng, target.lat, target.lng);
    }

    const startTime = now;
    const startLat = start.lat;
    const startLng = start.lng;

    const tick = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      let curLat = startLat + (target.lat - startLat) * progress;
      let curLng = startLng + (target.lng - startLng) * progress;
      let keepGoing = progress < 1;

      // Entre heartbeats el pin sigue andando a la velocidad del celular (como Uber).
      if (progress >= 1 && speed > MIN_MOVE_SPEED_MPS) {
        const extraMs = elapsed - duration;
        if (extraMs < MAX_GPS_EXTRAPOLATE_MS) {
          const coast = extrapolateGps(target.lat, target.lng, speed, courseRef.current, extraMs);
          curLat = coast.lat;
          curLng = coast.lng;
          keepGoing = true;
        }
      }

      if (currentTime - lastPaintRef.current >= FRAME_MS || !keepGoing) {
        lastPaintRef.current = currentTime;
        displayRef.current = { lat: curLat, lng: curLng };
        setDisplay({ lat: curLat, lng: curLng });
      }

      if (keepGoing) {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [lat, lng, speedMps, headingDeg]);

  return display;
}
