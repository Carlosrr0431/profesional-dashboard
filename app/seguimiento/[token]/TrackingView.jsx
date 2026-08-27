'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../../../src/lib/supabase';
import { MAP_STYLE } from '../../../src/lib/mapLibre';
import {
  decodePolyline,
  haversineMeters,
  getBearing,
  snapToRoute,
  splitRouteAtPoint,
  getPointAheadOnRoute,
  smoothAngle,
  formatEtaMinutes,
  formatDistanceKm,
  getProximityMessage,
  lerpPos,
  resolveTrackingPickup,
  resolveTrackingDropoff,
  resolveTrackingRouteTarget,
} from './trackingUtils';

/* ── CSS global ──────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; }
  @keyframes trk-spin       { to { transform: rotate(360deg); } }
  @keyframes trk-pulse-ring { 0%{transform:scale(0.85);opacity:0.7} 100%{transform:scale(2.4);opacity:0} }
  @keyframes trk-pickup-pulse { 0%{transform:scale(1);opacity:0.55} 100%{transform:scale(2.2);opacity:0} }
  @keyframes trk-float-in   { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes trk-blink       { 0%,100%{opacity:1} 50%{opacity:0.35} }
  @keyframes trk-eta-pop     { 0%{transform:scale(0.92);opacity:0} 100%{transform:scale(1);opacity:1} }
  .trk-spinner     { animation: trk-spin 0.85s linear infinite; }
  .trk-pulse-ring  { animation: trk-pulse-ring 1.8s ease-out infinite; }
  .trk-pickup-pulse{ animation: trk-pickup-pulse 2s ease-out infinite; }
  .trk-float-in    { animation: trk-float-in 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .trk-blink       { animation: trk-blink 1.4s ease-in-out infinite; }
  .trk-eta-pop     { animation: trk-eta-pop 0.35s cubic-bezier(0.22,1,0.36,1) both; }
  .trk-scroll      { overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .trk-scroll::-webkit-scrollbar { display: none; }
  .maplibregl-ctrl-attrib { font-size:10px !important; background:rgba(255,255,255,0.7) !important; }
  .maplibregl-ctrl-logo { display:none !important; }
  @media (min-width: 640px) {
    .trk-root  { flex-direction: row !important; }
    .trk-map   { flex: 1 !important; height: 100% !important; }
    .trk-panel { width:380px !important; height:100% !important; border-radius:0 !important; box-shadow:-4px 0 32px rgba(0,0,0,0.09) !important; max-height:100% !important; }
  }
`;

/* ── Capas MapLibre ──────────────────────────────────────────────────────── */
const ROUTE_BORDER_LAYER = {
  id: 'trk-route-border',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#FFFFFF', 'line-width': 10, 'line-opacity': 0.95 },
};
const ROUTE_LINE_LAYER = {
  id: 'trk-route-line',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#0F172A', 'line-width': 5, 'line-opacity': 1 },
};

/* ── Constantes ──────────────────────────────────────────────────────────── */
const DEFAULT_CENTER = { longitude: -65.4232, latitude: -24.7821 };
const DEFAULT_ZOOM = 14;
const ROUTE_REFRESH_MS = 45000;
const ROUTE_MOVE_THRESHOLD_M = 120;
const ANIMATION_MS = 1400;

const STATUS = {
  accepted:        { label: 'Confirmado',  color: '#2563EB' },
  going_to_pickup: { label: 'En camino',   color: '#1d2260' },
  in_progress:     { label: 'En viaje',    color: '#16a34a' },
  completed:       { label: 'Completado',  color: '#16a34a' },
  cancelled:       { label: 'Cancelado',   color: '#dc2626' },
};

/* ── Hooks de animación ──────────────────────────────────────────────────── */
function useAnimatedPosition(targetPos) {
  const [displayPos, setDisplayPos] = useState(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!targetPos) { setDisplayPos(null); return undefined; }
    if (!displayPos) { setDisplayPos(targetPos); return undefined; }

    const from = displayPos;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ANIMATION_MS);
      const eased = 1 - (1 - t) ** 3;
      setDisplayPos(lerpPos(from, targetPos, eased));
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [targetPos?.lat, targetPos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return displayPos;
}

function useSmoothHeading(targetHeading) {
  const [heading, setHeading] = useState(0);
  const currentRef = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(targetHeading)) return undefined;
    let frame;
    const animate = () => {
      const diff = Math.abs(((targetHeading - currentRef.current + 540) % 360) - 180);
      if (diff < 0.5) { currentRef.current = targetHeading; setHeading(targetHeading); return; }
      const next = smoothAngle(currentRef.current, targetHeading, 0.22);
      currentRef.current = next;
      setHeading(next);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [targetHeading]);

  return heading;
}

/* Vista superior tipo R8: nariz arriba (bearing 0 = norte). Azul cobalto para leerse sobre la ruta. */
const CAR_BODY =
  'M45 8C55.5 8 65 13 70.5 24C75.5 34 76.5 46 75.5 60C74.8 72 77 86 79 100C81.2 116 80.2 132 76.5 146C72.2 162 62 171 51 174C48.2 175 46.2 175.2 45 175.2C43.8 175.2 41.8 175 39 174C28 171 17.8 162 13.5 146C9.8 132 8.8 116 11 100C13 86 15.2 72 14.5 60C13.5 46 14.5 34 19.5 24C25 13 34.5 8 45 8Z';

function CarSvg({ heading }) {
  const rotation = Number.isFinite(heading) ? heading : 0;
  return (
    <div style={{
      width: 68,
      height: 68,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transform: `rotate(${rotation}deg)`,
      filter: 'drop-shadow(0 4px 10px rgba(15,23,42,0.42))',
      pointerEvents: 'none',
      transition: 'transform 0.15s linear',
    }}>
      <svg width="56" height="56" viewBox="0 0 90 196" aria-hidden>
        <defs>
          <linearGradient id="trkCarPaint" x1="18" y1="8" x2="72" y2="176" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7EB6FF" />
            <stop offset="0.45" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
        <path d={CAR_BODY} fill="#FFFFFF" />
        <rect x="5" y="40" width="11" height="30" rx="4.5" fill="#020617" />
        <rect x="74" y="40" width="11" height="30" rx="4.5" fill="#020617" />
        <rect x="5" y="124" width="11" height="30" rx="4.5" fill="#020617" />
        <rect x="74" y="124" width="11" height="30" rx="4.5" fill="#020617" />
        <path d={CAR_BODY} fill="url(#trkCarPaint)" stroke="#F8FAFC" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M29 34L61 34L65.5 62L24.5 62Z" fill="#0B1220" />
        <path d="M32 66L58 66L56 104L34 104Z" fill="#2563EB" opacity="0.55" />
        <path d="M28 108L62 108L59.5 146L30.5 146Z" fill="#0B1220" />
        <rect x="34" y="118" width="22" height="3.2" rx="1.4" fill="#64748B" />
        <rect x="34" y="126" width="22" height="3.2" rx="1.4" fill="#64748B" />
        <rect x="34" y="134" width="22" height="3.2" rx="1.4" fill="#64748B" />
        <path d="M9 90L21 85L22.5 118L9 113Z" fill="#0B1220" />
        <path d="M81 90L69 85L67.5 118L81 113Z" fill="#0B1220" />
        <rect x="20" y="168" width="50" height="9" rx="2.5" fill="#0B1220" />
        <ellipse cx="12" cy="58" rx="6.5" ry="4.2" fill="#0B1220" />
        <ellipse cx="78" cy="58" rx="6.5" ry="4.2" fill="#0B1220" />
        <rect x="32" y="14" width="9" height="5" rx="2" fill="#F8FAFC" />
        <rect x="49" y="14" width="9" height="5" rx="2" fill="#F8FAFC" />
      </svg>
    </div>
  );
}

/* ── Pin de retiro ───────────────────────────────────────────────────────── */
function PickupPin() {
  return (
    <div style={{ width: 36, height: 36, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="trk-pickup-pulse" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(34,197,94,0.35)' }} />
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#22C55E', border: '3px solid #fff', boxShadow: '0 2px 12px rgba(34,197,94,0.45)', position: 'relative', zIndex: 1 }} />
    </div>
  );
}

/* ── Pin de destino ──────────────────────────────────────────────────────── */
function DestPin() {
  return (
    <div style={{ fontSize: 28, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>📍</div>
  );
}

/* ── Componente principal ────────────────────────────────────────────────── */
export default function TrackingView({ token }) {
  const [trip, setTrip] = useState(null);
  const [driver, setDriver] = useState(null);
  const [driverPos, setDriverPos] = useState(null);
  const [driverHeading, setDriverHeading] = useState(null);
  const [pickupPoint, setPickupPoint] = useState(null);
  const [dropoffPoint, setDropoffPoint] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [pageState, setPageState] = useState('loading');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [etaTick, setEtaTick] = useState(0);
  const [viewState, setViewState] = useState({ ...DEFAULT_CENTER, zoom: DEFAULT_ZOOM });

  const mapRef = useRef(null);
  const boundsSet = useRef(false);
  const lastRouteOrigin = useRef(null);
  const lastRouteFetchAt = useRef(0);
  const headingRef = useRef(null);
  const lastProgressIdxRef = useRef(0);

  /* ── Snapshot ──────────────────────────────────────────────────────────── */
  const fetchSnapshot = useCallback(async (t) => {
    const res = await fetch(`/api/public-tracking/${encodeURIComponent(t)}`, { cache: 'no-store' });
    const p = await res.json();
    if (!res.ok || !p?.ok) throw new Error(p?.error?.message || 'Not found');
    return p.data;
  }, []);

  const extractPos = useCallback((data) => {
    const tLat = parseFloat(data?.lastTrack?.lat);
    const tLng = parseFloat(data?.lastTrack?.lng);
    if (Number.isFinite(tLat) && Number.isFinite(tLng)) {
      const heading = Number.parseFloat(data?.lastTrack?.heading);
      if (Number.isFinite(heading)) headingRef.current = heading;
      return { lat: tLat, lng: tLng };
    }
    const lat = parseFloat(data?.driver?.current_lat);
    const lng = parseFloat(data?.driver?.current_lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }, []);

  const applySnapshot = useCallback((data) => {
    const nextTrip = data?.trip || null;
    setTrip(nextTrip);
    setDriver(data?.driver || null);
    setDriverPos(extractPos(data));
    setPickupPoint(resolveTrackingPickup(nextTrip, data?.pickup));
    setDropoffPoint(resolveTrackingDropoff(nextTrip, data?.dropoff));
    const h = Number.parseFloat(data?.lastTrack?.heading);
    if (Number.isFinite(h)) { headingRef.current = h; setDriverHeading(h); }
    setLastUpdated(new Date());
  }, [extractPos]);

  /* ── Ruta ──────────────────────────────────────────────────────────────── */
  const fetchRoute = useCallback(async (origin, t) => {
    if (!origin || !t) return;
    setRouteLoading(true);
    try {
      const qs = new URLSearchParams({ originLat: String(origin.lat), originLng: String(origin.lng) });
      const res = await fetch(`/api/public-tracking/${encodeURIComponent(t)}/directions?${qs}`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) return;
      const coords = decodePolyline(payload.data?.polyline || '');
      if (coords.length >= 2) {
        setRouteCoords(coords);
        setRouteMetrics({
          durationMinutes: payload.data.durationMinutes,
          durationSeconds: payload.data.durationSeconds,
          distanceMeters: payload.data.distanceMeters,
          fetchedAt: Date.now(),
        });
        lastRouteOrigin.current = origin;
        lastRouteFetchAt.current = Date.now();
      }
    } catch { /* mantener ruta anterior */ }
    finally { setRouteLoading(false); }
  }, []);

  /* ── Carga inicial ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!token) { setPageState('not_found'); return; }
    let dead = false;
    (async () => {
      try {
        const d = await fetchSnapshot(token);
        if (dead) return;
        applySnapshot(d);
        setPageState('ready');
      } catch { if (!dead) setPageState('not_found'); }
    })();
    return () => { dead = true; };
  }, [fetchSnapshot, token, applySnapshot]);

  /* ── Realtime subscriptions ────────────────────────────────────────────── */
  useEffect(() => {
    if (pageState !== 'ready' || !trip?.id) return undefined;
    const channels = [];
    const touch = () => setLastUpdated(new Date());

    channels.push(supabase
      .channel(`pub-trk-trip-${trip.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${trip.id}` }, (p) => {
        if (!p?.new) return;
        setTrip((prev) => {
          const next = { ...(prev || {}), ...p.new };
          setPickupPoint(resolveTrackingPickup(next, null));
          setDropoffPoint(resolveTrackingDropoff(next, null));
          return next;
        });
        touch();
      }).subscribe());

    channels.push(supabase
      .channel(`pub-trk-track-${trip.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_tracking', filter: `trip_id=eq.${trip.id}` }, (p) => {
        const pt = p?.new; if (!pt) return;
        const lat = Number.parseFloat(pt.lat); const lng = Number.parseFloat(pt.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const h = Number.parseFloat(pt.heading);
        if (Number.isFinite(h)) { headingRef.current = h; setDriverHeading(h); }
        setDriverPos({ lat, lng }); touch();
      }).subscribe());

    if (trip?.driver_id) {
      const dId = trip.driver_id;
      channels.push(supabase
        .channel(`pub-trk-driver-${dId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${dId}` }, (p) => {
          const nd = p?.new; if (!nd) return;
          setDriver((prev) => ({ ...(prev || {}), ...nd }));
          const lat = Number.parseFloat(nd.current_lat); const lng = Number.parseFloat(nd.current_lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) setDriverPos({ lat, lng });
          touch();
        }).subscribe());

      channels.push(supabase
        .channel(`pub-trk-dloc-${dId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${dId}` }, (p) => {
          const loc = p?.new; if (!loc) return;
          const lat = Number.parseFloat(loc.lat); const lng = Number.parseFloat(loc.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) { setDriverPos({ lat, lng }); touch(); }
        }).subscribe());
    }

    const pollId = setInterval(async () => {
      try { const d = await fetchSnapshot(token); applySnapshot(d); } catch { /* ok */ }
    }, 15000);

    return () => { clearInterval(pollId); channels.forEach((ch) => supabase.removeChannel(ch)); };
  }, [pageState, trip?.id, trip?.driver_id, token, fetchSnapshot, applySnapshot]);

  /* ── Derivados ─────────────────────────────────────────────────────────── */
  const isPickupStage   = trip?.status === 'accepted' || trip?.status === 'going_to_pickup';
  const isLive          = isPickupStage || trip?.status === 'in_progress';
  const goingToDestination = trip?.status === 'in_progress' || trip?.status === 'completed';

  const pickup = useMemo(
    () => resolveTrackingPickup(trip, pickupPoint),
    [trip, pickupPoint],
  );
  const dropoff = useMemo(
    () => resolveTrackingDropoff(trip, dropoffPoint),
    [trip, dropoffPoint],
  );
  const targetPoint = useMemo(
    () => resolveTrackingRouteTarget(trip, pickup, dropoff),
    [trip, pickup, dropoff],
  );

  const displayPos = useAnimatedPosition(driverPos);

  const snappedPos = useMemo(() => {
    if (!displayPos || routeCoords.length < 2) return displayPos;
    return snapToRoute(displayPos, routeCoords);
  }, [displayPos, routeCoords]);

  // Al cambiar la ruta completa, reiniciar el avance de la polilínea.
  useEffect(() => {
    lastProgressIdxRef.current = 0;
  }, [routeCoords]);

  const remainingPath = useMemo(() => {
    if (!snappedPos || routeCoords.length < 2) return routeCoords;
    const split = splitRouteAtPoint(snappedPos, routeCoords);
    const remaining = split.remaining ?? [];
    if (remaining.length < 2) return remaining;

    // Índice del segmento donde está el chofer (avance monotónico).
    let segIdx = 0;
    for (let i = 0; i < routeCoords.length - 1; i += 1) {
      const a = routeCoords[i];
      const b = routeCoords[i + 1];
      const ab = haversineMeters(a, b) || 1;
      const ap = haversineMeters(a, remaining[0]);
      const pb = haversineMeters(remaining[0], b);
      if (ap + pb <= ab + 8) {
        segIdx = i;
        break;
      }
      segIdx = i;
    }
    lastProgressIdxRef.current = Math.max(lastProgressIdxRef.current, segIdx);
    const idx = lastProgressIdxRef.current;
    return [remaining[0], ...routeCoords.slice(idx + 1)].filter((point, i, arr) => {
      if (i === 0) return true;
      return haversineMeters(arr[i - 1], point) > 1.5;
    });
  }, [snappedPos, routeCoords]);

  const routeGeoJSON = useMemo(() => {
    const path = remainingPath.length >= 2 ? remainingPath : routeCoords;
    if (path.length < 2) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: path.map((p) => [p.lng, p.lat]),
      },
    };
  }, [remainingPath, routeCoords]);

  const routeHeading = useMemo(() => {
    if (!snappedPos || routeCoords.length < 2) return null;
    const ahead = getPointAheadOnRoute(snappedPos, routeCoords, 65);
    return ahead ? getBearing(snappedPos, ahead) : null;
  }, [snappedPos, routeCoords]);

  const markerHeading = useSmoothHeading(
    Number.isFinite(driverHeading) ? driverHeading
      : Number.isFinite(headingRef.current) ? headingRef.current
        : routeHeading ?? 0
  );

  /* ── Actualizar cámara cuando llegan coordenadas / ruta ────────────────── */
  useEffect(() => {
    const map = mapRef.current?.getMap?.() || mapRef.current;
    const path = remainingPath.length >= 2 ? remainingPath : routeCoords;
    if (!trip) return;

    if (!boundsSet.current && path.length >= 2) {
      boundsSet.current = true;
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      const points = [...path];
      if (snappedPos || driverPos) points.push(snappedPos || driverPos);
      if (targetPoint) points.push(targetPoint);
      for (const p of points) {
        if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLng = Math.min(minLng, p.lng);
        maxLng = Math.max(maxLng, p.lng);
      }
      if (Number.isFinite(minLat) && map?.fitBounds) {
        map.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 72, duration: 700, maxZoom: 16 },
        );
        return;
      }
      const center = snappedPos || driverPos || targetPoint;
      if (center) {
        setViewState((v) => ({ ...v, latitude: center.lat, longitude: center.lng, zoom: 15 }));
      }
      return;
    }

    if (isLive && snappedPos) {
      setViewState((v) => ({ ...v, latitude: snappedPos.lat, longitude: snappedPos.lng }));
    }
  }, [remainingPath, routeCoords, snappedPos?.lat, snappedPos?.lng, driverPos, targetPoint, trip, isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Ruta: refetch cuando el conductor se mueve ────────────────────────── */
  useEffect(() => {
    if (!driverPos || !token || !isLive || !targetPoint) return undefined;
    const movedEnough = !lastRouteOrigin.current || haversineMeters(driverPos, lastRouteOrigin.current) >= ROUTE_MOVE_THRESHOLD_M;
    const stale = Date.now() - lastRouteFetchAt.current >= ROUTE_REFRESH_MS;
    if (movedEnough || stale || routeCoords.length === 0) fetchRoute(driverPos, token);
  }, [driverPos?.lat, driverPos?.lng, token, isLive, targetPoint, fetchRoute, routeCoords.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── ETA ticker ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isLive || !routeMetrics?.fetchedAt) return undefined;
    const id = setInterval(() => setEtaTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [isLive, routeMetrics?.fetchedAt]);

  const distanceToTarget = useMemo(() => {
    if (!snappedPos || !targetPoint) return null;
    if (remainingPath.length >= 2) {
      let total = 0;
      for (let i = 0; i < remainingPath.length - 1; i += 1) total += haversineMeters(remainingPath[i], remainingPath[i + 1]);
      return total;
    }
    return haversineMeters(snappedPos, targetPoint);
  }, [snappedPos, targetPoint, remainingPath, etaTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const etaMinutes = useMemo(() => {
    if (!routeMetrics?.durationSeconds || !routeMetrics?.distanceMeters || !Number.isFinite(distanceToTarget)) {
      return routeMetrics?.durationMinutes ?? null;
    }
    const ratio = Math.min(1, Math.max(0, distanceToTarget / routeMetrics.distanceMeters));
    const secondsLeft = Math.max(0, Math.round(routeMetrics.durationSeconds * ratio));
    const elapsed = Math.floor((Date.now() - routeMetrics.fetchedAt) / 1000);
    return Math.max(1, Math.round(Math.max(0, secondsLeft - Math.min(elapsed, 30)) / 60));
  }, [routeMetrics, distanceToTarget, etaTick]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Estados de carga / not found ──────────────────────────────────────── */
  if (pageState === 'loading') return (
    <div style={S.centered}>
      <style>{GLOBAL_CSS}</style>
      <div className="trk-spinner" style={S.spinner} />
      <p style={S.loadTxt}>Cargando seguimiento…</p>
    </div>
  );

  if (pageState === 'not_found') return (
    <div style={S.centered}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ fontSize: 52, lineHeight: 1 }}>🔍</div>
      <h2 style={S.nfTitle}>Viaje no encontrado</h2>
      <p style={S.nfSub}>El enlace no es válido o el viaje ya expiró.</p>
    </div>
  );

  /* ── Render ────────────────────────────────────────────────────────────── */
  const st = STATUS[trip?.status] ?? STATUS.going_to_pickup;
  const vehicleTxt = [driver?.vehicle_color, driver?.vehicle_brand, driver?.vehicle_model, driver?.vehicle_plate].filter(Boolean).join(' · ');
  const showPickup = Boolean(pickup);
  const showDest = Boolean(dropoff) && (goingToDestination || !isPickupStage);
  const proximityMsg = getProximityMessage(distanceToTarget, trip?.status);
  const distanceLabel = formatDistanceKm(distanceToTarget);
  const arrivedAtPickup = isPickupStage && Number.isFinite(distanceToTarget) && distanceToTarget <= 50;

  return (
    <div className="trk-root" style={S.root}>
      <style>{GLOBAL_CSS}</style>

      {/* ── Mapa MapLibre ───────────────────────────────────────────────── */}
      <div className="trk-map" style={S.mapWrap}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(e) => setViewState(e.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLE}
          attributionControl={false}
          pitchWithRotate={false}
          maxPitch={0}
        >
          {/* Ruta restante */}
          {routeGeoJSON && (
            <Source id="trk-route" type="geojson" data={routeGeoJSON}>
              <Layer {...ROUTE_BORDER_LAYER} />
              <Layer {...ROUTE_LINE_LAYER} />
            </Source>
          )}

          {/* Marcador retiro (origen) */}
          {showPickup && pickup && (
            <Marker latitude={pickup.lat} longitude={pickup.lng} anchor="center">
              <PickupPin />
            </Marker>
          )}

          {/* Marcador destino */}
          {showDest && dropoff && (
            <Marker
              latitude={dropoff.lat}
              longitude={dropoff.lng}
              anchor="bottom"
            >
              <DestPin />
            </Marker>
          )}

          {/* Marcador conductor */}
          {snappedPos && isLive && (
            <Marker latitude={snappedPos.lat} longitude={snappedPos.lng} anchor="center">
              <CarSvg heading={markerHeading} />
            </Marker>
          )}
        </Map>

        {/* Badge EN VIVO */}
        {isLive && (
          <div className="trk-float-in" style={S.liveBadge}>
            <span className="trk-blink" style={S.liveDot}>●</span>
            <span>EN VIVO</span>
            {lastUpdated && (
              <span style={S.liveTime}>
                {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Panel inferior ──────────────────────────────────────────────── */}
      <div className="trk-panel trk-scroll trk-float-in" style={S.panel}>
        <div style={S.handle} />

        {isPickupStage && (
          <div className="trk-eta-pop" style={S.etaBlock}>
            {arrivedAtPickup ? (
              <>
                <p style={S.etaLabel}>Tu chofer llegó</p>
                <p style={S.etaSub}>Salí a encontrarlo en el punto de retiro</p>
              </>
            ) : (
              <>
                <p style={S.etaLabel}>
                  {routeLoading && !etaMinutes ? 'Calculando llegada…' : 'Llegada estimada'}
                </p>
                <div style={S.etaRow}>
                  <span style={{ ...S.etaNumber, color: st.color }}>
                    {etaMinutes != null ? formatEtaMinutes(etaMinutes) : '—'}
                  </span>
                  {distanceLabel && <span style={S.etaDistance}>· {distanceLabel}</span>}
                </div>
                <p style={S.etaSub}>{proximityMsg}</p>
              </>
            )}

            {Number.isFinite(distanceToTarget) && routeMetrics?.distanceMeters && (
              <div style={S.progressTrack}>
                <div style={{
                  ...S.progressFill,
                  width: `${Math.max(4, Math.min(100, 100 - (distanceToTarget / routeMetrics.distanceMeters) * 100))}%`,
                  background: st.color,
                }} />
              </div>
            )}
          </div>
        )}

        {!isPickupStage && (
          <div style={S.statusBlock}>
            <span style={{ ...S.statusPill, color: st.color, borderColor: `${st.color}33` }}>{st.label}</span>
            <p style={S.etaSub}>{proximityMsg}</p>
          </div>
        )}

        <div style={S.routeBlock}>
          <div style={S.routeCol}>
            <span style={{ ...S.dot, background: '#22C55E', boxShadow: '0 0 0 3px rgba(34,197,94,0.18)' }} />
            <span style={S.conn} />
            <span style={{ ...S.dot, background: '#EF4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.18)' }} />
          </div>
          <div style={S.addrs}>
            <div>
              <p style={S.addrLbl}>Punto de retiro</p>
              <p style={S.addrTxt}>{pickup?.address || trip?.origin_address || 'Pendiente'}</p>
            </div>
            <div>
              <p style={S.addrLbl}>Destino</p>
              <p style={S.addrTxt}>{dropoff?.address || trip?.destination_address || 'Por definir'}</p>
            </div>
          </div>
        </div>

        <div style={S.divider} />

        {driver ? (
          <div style={S.driverRow}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {driver.photo_url
                ? <img src={driver.photo_url} alt={driver.full_name} style={S.avImg} />
                : <div style={S.avInit}>{(driver.full_name || '?').charAt(0).toUpperCase()}</div>}
              <span style={{ ...S.online, background: isLive ? '#22C55E' : '#CBD5E1' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={S.dName}>{driver.full_name || 'Tu chofer'}</p>
              {vehicleTxt && <p style={S.dSub}>{vehicleTxt}</p>}
              {isPickupStage && !arrivedAtPickup && <p style={S.dEnRoute}>Viene a buscarte</p>}
            </div>
          </div>
        ) : (
          <p style={S.waitingDriver}>Asignando chofer…</p>
        )}

        <p style={S.brand}>Profesional App · Seguimiento en vivo</p>
      </div>
    </div>
  );
}

/* ── Estilos ─────────────────────────────────────────────────────────────── */
const S = {
  root:     { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", background: '#f8f9fb', color: '#0F172A' },
  centered: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb', padding: 32, gap: 14, textAlign: 'center' },
  spinner:  { width: 36, height: 36, border: '3px solid #E2E8F0', borderTop: '3px solid #1d2260', borderRadius: '50%' },
  loadTxt:  { color: '#64748B', fontSize: 14, margin: 0, fontWeight: 500 },
  nfTitle:  { color: '#0F172A', fontSize: 22, fontWeight: 700, margin: 0 },
  nfSub:    { color: '#64748B', fontSize: 14, margin: 0, maxWidth: 280, lineHeight: 1.6 },
  mapWrap:  { flex: 1, position: 'relative', minHeight: 0 },
  liveBadge:{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.94)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', color: '#1d2260', zIndex: 10 },
  liveDot:  { color: '#22C55E', fontSize: 10 },
  liveTime: { marginLeft: 4, color: '#94A3B8', fontWeight: 500 },
  panel:    { background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0 -8px 36px rgba(0,0,0,0.12)', padding: '8px 20px 28px', flexShrink: 0, maxHeight: '52vh' },
  handle:   { width: 36, height: 4, borderRadius: 2, background: '#E2E8F0', margin: '8px auto 16px' },
  etaBlock: { marginBottom: 18 },
  etaLabel: { margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' },
  etaRow:   { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  etaNumber:{ fontSize: 42, fontWeight: 800, lineHeight: 1, letterSpacing: '-1px' },
  etaDistance: { fontSize: 16, fontWeight: 600, color: '#64748B' },
  etaSub:   { margin: '6px 0 0', fontSize: 14, fontWeight: 500, color: '#334155', lineHeight: 1.45 },
  progressTrack: { marginTop: 14, height: 4, borderRadius: 999, background: '#EEF2F7', overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 999, transition: 'width 0.8s ease' },
  statusBlock: { marginBottom: 16 },
  statusPill:  { display: 'inline-block', padding: '5px 12px', borderRadius: 999, border: '1px solid', fontSize: 12, fontWeight: 700, marginBottom: 6 },
  routeBlock: { display: 'flex', gap: 14, marginBottom: 16 },
  routeCol:   { display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, flexShrink: 0 },
  dot:  { width: 11, height: 11, borderRadius: '50%', flexShrink: 0 },
  conn: { width: 2, flex: 1, minHeight: 22, margin: '5px 0', borderRadius: 2, background: 'linear-gradient(to bottom,#22C55E,#EF4444)', opacity: 0.3 },
  addrs:   { flex: 1, display: 'flex', flexDirection: 'column', gap: 14 },
  addrLbl: { margin: '0 0 2px', fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' },
  addrTxt: { margin: 0, fontSize: 13, fontWeight: 500, color: '#0F172A', lineHeight: 1.45 },
  divider: { height: 1, background: '#F1F5F9', margin: '0 0 16px' },
  driverRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 },
  avImg:  { width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #E2E8F0', display: 'block' },
  avInit: { width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#1d2260,#2e3699)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700 },
  online: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%', border: '2px solid #fff' },
  dName:  { margin: '0 0 3px', fontSize: 16, fontWeight: 700, color: '#0F172A' },
  dSub:   { margin: 0, fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dEnRoute: { margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: '#1d2260' },
  waitingDriver: { margin: '0 0 8px', fontSize: 14, color: '#64748B', fontWeight: 500 },
  brand:  { margin: '16px 0 0', textAlign: 'center', fontSize: 11, color: '#CBD5E1', fontWeight: 500, letterSpacing: '0.3px' },
};
