'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Polyline,
  OverlayView,
} from '@react-google-maps/api';

// ── Config ─────────────────────────────────────────────────────────────────
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Stable reference — must not be recreated on each render
const LIBRARIES = [];
const MAP_CONTAINER = { width: '100%', height: '100%' };

// ── Map style ──────────────────────────────────────────────────────────────
const MAP_OPTIONS = {
  disableDefaultUI: true,
  gestureHandling: 'greedy',
  clickableIcons: false,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#f0f1f5' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e2e8f0' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#cbd5e1' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9dcf0' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ],
};

// ── Status display config ──────────────────────────────────────────────────
const STATUS_CONFIG = {
  accepted: {
    text: 'Viaje aceptado',
    sub: 'El chofer está preparándose',
    color: '#3B82F6',
    bg: '#EFF6FF',
  },
  going_to_pickup: {
    text: 'En camino a buscarte',
    sub: 'El chofer está en camino hacia vos',
    color: '#282e69',
    bg: '#EDEEF7',
  },
  in_progress: {
    text: 'Viaje en curso',
    sub: 'Estás en camino a tu destino',
    color: '#22C55E',
    bg: '#F0FDF4',
  },
  completed: {
    text: '¡Llegaste a destino!',
    sub: 'El viaje fue completado exitosamente',
    color: '#22C55E',
    bg: '#F0FDF4',
  },
  cancelled: {
    text: 'Viaje cancelado',
    sub: 'Este viaje fue cancelado',
    color: '#EF4444',
    bg: '#FEF2F2',
  },
};

// ── Component ──────────────────────────────────────────────────────────────
export default function TrackingView({ token }) {
  const [trip, setTrip] = useState(null);
  const [driver, setDriver] = useState(null);
  const [driverPos, setDriverPos] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [pageState, setPageState] = useState('loading'); // 'loading' | 'ready' | 'not_found'

  const mapRef = useRef(null);
  const lastRouteKeyRef = useRef('');

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });

  const fetchSnapshot = useCallback(async (trackingToken) => {
    const response = await fetch(`/api/public-tracking/${encodeURIComponent(trackingToken)}`, {
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || 'Tracking not found');
    }
    return payload.data;
  }, []);

  // ── Load initial trip + driver ─────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setPageState('not_found');
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const data = await fetchSnapshot(token);

        if (cancelled) return;

        setTrip(data?.trip || null);
        setDriver(data?.driver || null);

        const trackLat = parseFloat(data?.lastTrack?.lat);
        const trackLng = parseFloat(data?.lastTrack?.lng);
        if (Number.isFinite(trackLat) && Number.isFinite(trackLng)) {
          setDriverPos({ lat: trackLat, lng: trackLng });
        } else {
          const lat = parseFloat(data?.driver?.current_lat);
          const lng = parseFloat(data?.driver?.current_lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setDriverPos({ lat, lng });
          }
        }

        setPageState('ready');
      } catch {
        if (!cancelled) setPageState('not_found');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchSnapshot, token]);

  // ── Poll updates for public link ───────────────────────────────────────
  useEffect(() => {
    if (!token || pageState !== 'ready' || !trip?.id) return;

    let cancelled = false;
    const intervalId = setInterval(async () => {
      try {
        const data = await fetchSnapshot(token);
        if (cancelled) return;

        setTrip(data?.trip || null);
        setDriver(data?.driver || null);

        const trackLat = parseFloat(data?.lastTrack?.lat);
        const trackLng = parseFloat(data?.lastTrack?.lng);
        if (Number.isFinite(trackLat) && Number.isFinite(trackLng)) {
          setDriverPos({ lat: trackLat, lng: trackLng });
        } else {
          const lat = parseFloat(data?.driver?.current_lat);
          const lng = parseFloat(data?.driver?.current_lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setDriverPos({ lat, lng });
          }
        }
      } catch {
        // Keep current state on transient polling failures.
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [fetchSnapshot, pageState, token, trip?.id]);

  // ── Build route from driver position to next waypoint ─────────────────
  const fetchRoute = useCallback(
    (origin, dest) => {
      if (!origin || !dest) return;

      // Only re-fetch when driver has moved enough (~55 m resolution)
      const key = `${Math.round(origin.lat * 1800)}:${Math.round(origin.lng * 1800)}`;
      if (key === lastRouteKeyRef.current) return;
      lastRouteKeyRef.current = key;

      // Avoid deprecated DirectionsService in JS Maps API.
      setRoutePath([
        { lat: origin.lat, lng: origin.lng },
        { lat: dest.lat, lng: dest.lng },
      ]);
    },
    [],
  );

  useEffect(() => {
    if (!driverPos || !trip || !isLoaded) return;

    const inProgress = trip.status === 'in_progress';
    const destLat = parseFloat(inProgress ? trip.destination_lat : trip.origin_lat);
    const destLng = parseFloat(inProgress ? trip.destination_lng : trip.origin_lng);

    if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) return;

    fetchRoute(driverPos, { lat: destLat, lng: destLng });
  }, [driverPos?.lat, driverPos?.lng, trip?.status, isLoaded, fetchRoute]);

  // ── Auto-pan map to follow driver ──────────────────────────────────────
  useEffect(() => {
    if (mapRef.current && driverPos) {
      mapRef.current.panTo({ lat: driverPos.lat, lng: driverPos.lng });
    }
  }, [driverPos?.lat, driverPos?.lng]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────
  const statusInfo = STATUS_CONFIG[trip?.status] ?? STATUS_CONFIG.going_to_pickup;

  const mapCenter = driverPos
    ?? (trip?.origin_lat
      ? { lat: parseFloat(trip.origin_lat), lng: parseFloat(trip.origin_lng) }
      : { lat: -24.7821, lng: -65.4232 });

  const driverVehicleText = [
    driver?.vehicle_color,
    driver?.vehicle_brand,
    driver?.vehicle_model,
    driver?.vehicle_plate,
  ]
    .filter(Boolean)
    .join(' · ');

  const showPickupMarker =
    trip?.status !== 'in_progress' &&
    trip?.origin_lat &&
    Number.isFinite(parseFloat(trip.origin_lat));

  const showDestMarker =
    !!trip?.destination_lat && Number.isFinite(parseFloat(trip.destination_lat));

  // ── Loading screen ─────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div style={css.centered}>
        <style>{`
          @keyframes trk-spin { to { transform: rotate(360deg); } }
          .trk-spinner { animation: trk-spin 0.9s linear infinite; }
        `}</style>
        <div
          className="trk-spinner"
          style={{
            width: 40,
            height: 40,
            border: '3px solid #E2E8F0',
            borderTop: '3px solid #282e69',
            borderRadius: '50%',
          }}
        />
        <p style={{ color: '#64748B', fontSize: 14, margin: 0, fontFamily: 'Inter, sans-serif' }}>
          Cargando seguimiento...
        </p>
      </div>
    );
  }

  // ── Not-found screen ───────────────────────────────────────────────────
  if (pageState === 'not_found') {
    return (
      <div style={{ ...css.centered, gap: 8 }}>
        <span style={{ fontSize: 52 }}>🔍</span>
        <h2 style={{ color: '#0F172A', fontSize: 20, fontWeight: 700, margin: 0, fontFamily: 'Inter, sans-serif' }}>
          Viaje no encontrado
        </h2>
        <p style={{ color: '#64748B', fontSize: 14, margin: 0, lineHeight: 1.5, maxWidth: 300, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
          El enlace no es válido o el viaje ya expiró.
        </p>
      </div>
    );
  }

  // ── Main tracking view ─────────────────────────────────────────────────
  return (
    <div style={css.root}>
      {/* Status banner */}
      <div
        style={{
          ...css.statusBar,
          background: statusInfo.bg,
          borderBottomColor: statusInfo.color,
        }}
      >
        <div style={{ ...css.statusDot, background: statusInfo.color }} />
        <div>
          <p style={{ ...css.statusText, color: statusInfo.color }}>{statusInfo.text}</p>
          <p style={css.statusSub}>{statusInfo.sub}</p>
        </div>
      </div>

      {/* Map */}
      <div style={css.mapWrap}>
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER}
            center={{ lat: mapCenter.lat, lng: mapCenter.lng }}
            zoom={15}
            options={MAP_OPTIONS}
            onLoad={onMapLoad}
          >
            {/* Driver marker */}
            {driverPos && (
              <OverlayView
                position={{ lat: driverPos.lat, lng: driverPos.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={() => ({ x: -22, y: -22 })}
              >
                <div style={css.carMarker}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                    <path d="M18.92 6.01A2 2 0 0018 5H6a2 2 0 00-.92 1.01L3 12v8a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-8l-2.08-5.99zM6.5 16a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm11 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM5 11l1.5-4.5h11L19 11H5z" />
                  </svg>
                </div>
              </OverlayView>
            )}

            {/* Pickup marker (green circle) */}
            {showPickupMarker && (
              <Marker
                position={{
                  lat: parseFloat(trip.origin_lat),
                  lng: parseFloat(trip.origin_lng),
                }}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 9,
                  fillColor: '#22C55E',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2.5,
                }}
                title="Punto de encuentro"
              />
            )}

            {/* Destination marker (red pin) */}
            {showDestMarker && (
              <Marker
                position={{
                  lat: parseFloat(trip.destination_lat),
                  lng: parseFloat(trip.destination_lng),
                }}
                icon={{
                  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
                  fillColor: '#EF4444',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 1,
                  scale: 1.8,
                  anchor: new window.google.maps.Point(12, 22),
                }}
                title="Destino"
              />
            )}

            {/* Route polyline */}
            {routePath.length > 0 && (
              <Polyline
                path={routePath}
                options={{
                  strokeColor: '#282e69',
                  strokeOpacity: 0.85,
                  strokeWeight: 5,
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div style={css.mapPlaceholder}>
            <p style={{ color: '#64748B', fontSize: 14, fontFamily: 'Inter, sans-serif', margin: 0 }}>
              Cargando mapa...
            </p>
          </div>
        )}
      </div>

      {/* Info card */}
      <div style={css.card}>
        {/* Route */}
        <div style={css.routeRow}>
          <div style={css.dotCol}>
            <div style={{ ...css.dot, background: '#22C55E' }} />
            <div style={css.dotLine} />
            <div style={{ ...css.dot, background: '#EF4444' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={css.addrLabel}>Punto de encuentro</p>
            <p style={css.addrText}>{trip?.origin_address || 'Dirección pendiente'}</p>
            <div style={{ height: 12 }} />
            <p style={css.addrLabel}>Destino</p>
            <p style={css.addrText}>{trip?.destination_address || 'Por definir'}</p>
          </div>
        </div>

        <div style={css.divider} />

        {/* Driver info */}
        {driver && (
          <div style={css.driverRow}>
            <div style={css.avatar}>
              {driver.photo_url ? (
                <img
                  src={driver.photo_url}
                  alt={driver.full_name}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <span style={css.avatarInitial}>
                  {(driver.full_name || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p style={css.driverName}>{driver.full_name}</p>
              {driverVehicleText ? (
                <p style={css.driverVehicle}>{driverVehicleText}</p>
              ) : null}
            </div>
          </div>
        )}

        <p style={css.branding}>Seguimiento en vivo · Profesional App</p>
      </div>
    </div>
  );
}

// ── Inline styles ──────────────────────────────────────────────────────────
const css = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    background: '#F5F6FA',
    color: '#0F172A',
  },
  centered: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F5F6FA',
    padding: 24,
    gap: 12,
    textAlign: 'center',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 18px',
    borderBottom: '3px solid transparent',
    flexShrink: 0,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  statusSub: {
    margin: 0,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 1.3,
  },
  mapWrap: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  mapPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#E2E8F0',
  },
  carMarker: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#282e69',
    border: '3px solid #ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 12px rgba(0,0,0,0.3)',
  },
  card: {
    background: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    boxShadow: '0 -4px 24px rgba(0,0,0,0.09)',
    padding: '18px 20px 28px',
    flexShrink: 0,
  },
  routeRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 14,
  },
  dotCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  dotLine: {
    width: 2,
    flex: 1,
    background: '#E2E8F0',
    margin: '5px 0',
    minHeight: 18,
  },
  addrLabel: {
    margin: '0 0 2px',
    fontSize: 10,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
  },
  addrText: {
    margin: 0,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: 500,
    lineHeight: 1.4,
  },
  divider: {
    height: 1,
    background: '#F1F5F9',
    margin: '0 0 14px',
  },
  driverRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#282e69',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 700,
  },
  driverName: {
    margin: '0 0 2px',
    fontSize: 15,
    color: '#0F172A',
    fontWeight: 700,
  },
  driverVehicle: {
    margin: 0,
    fontSize: 12,
    color: '#64748B',
  },
  branding: {
    margin: '12px 0 0',
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
  },
};
