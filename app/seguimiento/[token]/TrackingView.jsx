'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Polyline,
  OverlayView,
} from '@react-google-maps/api';
import { supabase } from '../../../src/lib/supabase';

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  @keyframes trk-spin { to { transform: rotate(360deg); } }
  @keyframes trk-pulse-ring { 0% { transform: scale(1); opacity: 0.65; } 100% { transform: scale(2.5); opacity: 0; } }
  @keyframes trk-float-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes trk-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .trk-spinner { animation: trk-spin 0.85s linear infinite; }
  .trk-pulse-ring { animation: trk-pulse-ring 1.7s ease-out infinite; }
  .trk-float-in { animation: trk-float-in 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .trk-blink { animation: trk-blink 1.4s ease-in-out infinite; }
  .trk-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .trk-scroll::-webkit-scrollbar { display: none; }
  @media (min-width: 640px) {
    .trk-root { flex-direction: row !important; }
    .trk-map { flex: 1 !important; height: 100% !important; }
    .trk-panel { width: 340px !important; height: 100% !important; border-radius: 0 !important; box-shadow: -4px 0 32px rgba(0,0,0,0.09) !important; max-height: 100% !important; }
    .trk-pill { left: 50% !important; right: auto !important; transform: translateX(-50%) !important; min-width: 280px !important; }
  }
`;

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const LIBRARIES = [];
const MAP_CONTAINER = { width: '100%', height: '100%' };

const MAP_OPTIONS = {
  disableDefaultUI: true,
  gestureHandling: 'greedy',
  clickableIcons: false,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#f8f9fb' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8896a8' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e8ecf0' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#dde3ea' }] },
    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#a0aab4' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c8dff5' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  ],
};

const STATUS = {
  accepted:        { label: 'Aceptado',     text: 'Chofer preparandose',      icon: '🕐', color: '#3B82F6', border: 'rgba(59,130,246,0.3)' },
  going_to_pickup: { label: 'En camino',    text: 'El chofer va a buscarte',  icon: '🚕', color: '#1d2260', border: 'rgba(29,34,96,0.25)' },
  in_progress:     { label: 'En viaje',     text: 'En camino a tu destino',   icon: '🚀', color: '#16a34a', border: 'rgba(22,163,74,0.3)' },
  completed:       { label: '¡Llegaste!', text: 'Viaje completado',    icon: '✅',    color: '#16a34a', border: 'rgba(22,163,74,0.3)' },
  cancelled:       { label: 'Cancelado',    text: 'Este viaje fue cancelado', icon: '✕',    color: '#dc2626', border: 'rgba(220,38,38,0.25)' },
};

export default function TrackingView({ token }) {
  const [trip, setTrip]             = useState(null);
  const [driver, setDriver]         = useState(null);
  const [driverPos, setDriverPos]   = useState(null);
  const [routePath, setRoutePath]   = useState([]);
  const [pageState, setPageState]   = useState('loading');
  const [lastUpdated, setLastUpdated] = useState(null);
  const mapRef    = useRef(null);
  const lastKey   = useRef('');
  const boundsSet = useRef(false);

  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_KEY, libraries: LIBRARIES });

  const fetchSnapshot = useCallback(async (t) => {
    const res = await fetch(`/api/public-tracking/${encodeURIComponent(t)}`, { cache: 'no-store' });
    const p = await res.json();
    if (!res.ok || !p?.ok) throw new Error(p?.error?.message || 'Not found');
    return p.data;
  }, []);

  const extractPos = useCallback((data) => {
    const tLat = parseFloat(data?.lastTrack?.lat);
    const tLng = parseFloat(data?.lastTrack?.lng);
    if (Number.isFinite(tLat) && Number.isFinite(tLng)) return { lat: tLat, lng: tLng };
    const lat = parseFloat(data?.driver?.current_lat);
    const lng = parseFloat(data?.driver?.current_lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }, []);

  const applySnapshot = useCallback((data) => {
    setTrip(data?.trip || null);
    setDriver(data?.driver || null);
    setDriverPos(extractPos(data));
    setLastUpdated(new Date());
  }, [extractPos]);

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

  useEffect(() => {
    if (pageState !== 'ready' || !trip?.id) return;

    const channels = [];
    const touch = () => setLastUpdated(new Date());

    const tripChannel = supabase
      .channel(`public-tracking-trip-${trip.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${trip.id}` },
        (payload) => {
          const nextTrip = payload?.new;
          if (!nextTrip) return;
          setTrip((prev) => ({ ...(prev || {}), ...nextTrip }));
          touch();
        }
      )
      .subscribe();
    channels.push(tripChannel);

    const trackingChannel = supabase
      .channel(`public-tracking-track-${trip.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trip_tracking', filter: `trip_id=eq.${trip.id}` },
        (payload) => {
          const point = payload?.new;
          if (!point) return;
          const lat = Number.parseFloat(point.lat);
          const lng = Number.parseFloat(point.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          setDriverPos({ lat, lng });
          touch();
        }
      )
      .subscribe();
    channels.push(trackingChannel);

    if (trip?.driver_id) {
      const driverId = trip.driver_id;

      const driverChannel = supabase
        .channel(`public-tracking-driver-${driverId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` },
          (payload) => {
            const nextDriver = payload?.new;
            if (!nextDriver) return;

            setDriver((prev) => ({ ...(prev || {}), ...nextDriver }));

            const lat = Number.parseFloat(nextDriver.current_lat);
            const lng = Number.parseFloat(nextDriver.current_lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              setDriverPos({ lat, lng });
            }

            touch();
          }
        )
        .subscribe();
      channels.push(driverChannel);

      const driverLocationChannel = supabase
        .channel(`public-tracking-driver-location-${driverId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
          (payload) => {
            const location = payload?.new;
            if (!location) return;
            const lat = Number.parseFloat(location.lat);
            const lng = Number.parseFloat(location.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            setDriverPos({ lat, lng });
            touch();
          }
        )
        .subscribe();
      channels.push(driverLocationChannel);
    }

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [pageState, trip?.id, trip?.driver_id]);

  useEffect(() => {
    if (!driverPos || !trip || !isLoaded) return;
    const goingToDestination = trip.status === 'in_progress' || trip.status === 'completed';
    const dLat = parseFloat(goingToDestination ? trip.destination_lat : trip.origin_lat);
    const dLng = parseFloat(goingToDestination ? trip.destination_lng : trip.origin_lng);
    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
    const key = `${Math.round(driverPos.lat * 2000)}:${Math.round(driverPos.lng * 2000)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    setRoutePath([{ lat: driverPos.lat, lng: driverPos.lng }, { lat: dLat, lng: dLng }]);
  }, [driverPos?.lat, driverPos?.lng, trip?.status, isLoaded]);

  useEffect(() => {
    if (!mapRef.current || !driverPos || !window?.google?.maps) return;
    if (!boundsSet.current && trip) {
      boundsSet.current = true;
      const b = new window.google.maps.LatLngBounds();
      b.extend(driverPos);
      const oLat = parseFloat(trip.origin_lat), oLng = parseFloat(trip.origin_lng);
      if (Number.isFinite(oLat)) b.extend({ lat: oLat, lng: oLng });
      const dstLat = parseFloat(trip.destination_lat), dstLng = parseFloat(trip.destination_lng);
      if (Number.isFinite(dstLat)) b.extend({ lat: dstLat, lng: dstLng });
      mapRef.current.fitBounds(b, { top: 70, right: 24, bottom: 24, left: 24 });
    } else {
      mapRef.current.panTo({ lat: driverPos.lat, lng: driverPos.lng });
    }
  }, [driverPos?.lat, driverPos?.lng]);

  const onMapLoad = useCallback((m) => { mapRef.current = m; }, []);

  const st      = STATUS[trip?.status] ?? STATUS.going_to_pickup;
  const isLive  = trip?.status === 'going_to_pickup' || trip?.status === 'in_progress';
  const mapCenter = driverPos ?? (trip?.origin_lat
    ? { lat: parseFloat(trip.origin_lat), lng: parseFloat(trip.origin_lng) }
    : { lat: -24.7821, lng: -65.4232 });
  const vehicleTxt = [driver?.vehicle_color, driver?.vehicle_brand, driver?.vehicle_model, driver?.vehicle_plate]
    .filter(Boolean).join(' · ');
  const isPickupStage = trip?.status === 'accepted' || trip?.status === 'going_to_pickup';
  const showPickup = isPickupStage && !!trip?.origin_lat && Number.isFinite(parseFloat(trip.origin_lat));
  const showDest   = !!trip?.destination_lat && Number.isFinite(parseFloat(trip.destination_lat));

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

  return (
    <div className="trk-root" style={S.root}>
      <style>{GLOBAL_CSS}</style>

      <div className="trk-map" style={S.mapWrap}>
        {isLoaded ? (
          <GoogleMap mapContainerStyle={MAP_CONTAINER} center={mapCenter} zoom={15} options={MAP_OPTIONS} onLoad={onMapLoad}>
            {driverPos && (
              <OverlayView position={driverPos} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET} getPixelPositionOffset={() => ({ x: -26, y: -26 })}>
                <div style={S.mWrap}>
                  <div className="trk-pulse-ring" style={S.pulse} />
                  <div style={S.carDot}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M18.92 6.01A2 2 0 0018 5H6a2 2 0 00-.92 1.01L3 12v8a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-8l-2.08-5.99zM6.5 16a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm11 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM5 11l1.5-4.5h11L19 11H5z" />
                    </svg>
                  </div>
                </div>
              </OverlayView>
            )}
            {showPickup && (
              <Marker
                position={{ lat: parseFloat(trip.origin_lat), lng: parseFloat(trip.origin_lng) }}
                icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#22C55E', fillOpacity: 1, strokeColor: '#FFF', strokeWeight: 3 }}
              />
            )}
            {showDest && (
              <Marker
                position={{ lat: parseFloat(trip.destination_lat), lng: parseFloat(trip.destination_lng) }}
                icon={{
                  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
                  fillColor: '#EF4444', fillOpacity: 1, strokeColor: '#FFF', strokeWeight: 1.5,
                  scale: 1.8, anchor: new window.google.maps.Point(12, 22),
                }}
              />
            )}
            {routePath.length > 0 && (
              <Polyline
                path={routePath}
                options={{
                  strokeColor: '#1d2260',
                  strokeOpacity: 0,
                  icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.6, scale: 4 }, offset: '0', repeat: '14px' }],
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div style={S.mapLoader}><div className="trk-spinner" style={S.spinner} /></div>
        )}

        <div className="trk-pill trk-float-in" style={{ ...S.pill, borderColor: st.border }}>
          <span style={{ fontSize: 16 }}>{st.icon}</span>
          <div style={{ flex: 1 }}>
            <span style={{ ...S.pillLabel, color: st.color }}>{st.label}</span>
            {isLive && <span className="trk-blink" style={S.live}> ● EN VIVO</span>}
            <span style={S.pillSub}> · {st.text}</span>
          </div>
          {lastUpdated && (
            <span style={S.updTime}>
              {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="trk-panel trk-scroll trk-float-in" style={S.panel}>
        <div style={S.handle} />
        <div style={S.routeBlock}>
          <div style={S.routeCol}>
            <span style={{ ...S.dot, background: '#22C55E', boxShadow: '0 0 0 3px rgba(34,197,94,0.18)' }} />
            <span style={S.conn} />
            <span style={{ ...S.dot, background: '#EF4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.18)' }} />
          </div>
          <div style={S.addrs}>
            <div>
              <p style={S.addrLbl}>Punto de encuentro</p>
              <p style={S.addrTxt}>{trip?.origin_address || 'Pendiente'}</p>
            </div>
            <div>
              <p style={S.addrLbl}>Destino</p>
              <p style={S.addrTxt}>{trip?.destination_address || 'Por definir'}</p>
            </div>
          </div>
        </div>

        <div style={S.divider} />

        {driver && (
          <div style={S.driverRow}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {driver.photo_url
                ? <img src={driver.photo_url} alt={driver.full_name} style={S.avImg} />
                : <div style={S.avInit}>{(driver.full_name || '?').charAt(0).toUpperCase()}</div>}
              <span style={{ ...S.online, background: isLive ? '#22C55E' : '#CBD5E1' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={S.dName}>{driver.full_name}</p>
              {vehicleTxt && <p style={S.dSub}>{vehicleTxt}</p>}
            </div>
          </div>
        )}

        <p style={S.brand}>Profesional App · Seguimiento en vivo</p>
      </div>
    </div>
  );
}

const S = {
  root:     { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", background: '#f8f9fb', color: '#0F172A' },
  centered: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb', padding: 32, gap: 14, textAlign: 'center' },
  spinner:  { width: 36, height: 36, border: '3px solid #E2E8F0', borderTop: '3px solid #1d2260', borderRadius: '50%' },
  loadTxt:  { color: '#64748B', fontSize: 14, margin: 0, fontWeight: 500 },
  nfTitle:  { color: '#0F172A', fontSize: 22, fontWeight: 700, margin: 0 },
  nfSub:    { color: '#64748B', fontSize: 14, margin: 0, maxWidth: 280, lineHeight: 1.6 },
  mapWrap:   { flex: 1, position: 'relative', minHeight: 0 },
  mapLoader: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef0f4' },
  pill:      { position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 50, border: '1px solid transparent', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.92)', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', zIndex: 10 },
  pillLabel: { fontSize: 13, fontWeight: 700 },
  live:      { fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', color: '#22C55E' },
  pillSub:   { fontSize: 11, color: '#64748B' },
  updTime:   { fontSize: 11, color: '#94A3B8', fontWeight: 500, marginLeft: 'auto', whiteSpace: 'nowrap', paddingLeft: 8 },
  mWrap:  { width: 52, height: 52, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pulse:  { position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(29,34,96,0.22)' },
  carDot: { width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#1d2260,#2e3699)', border: '3px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 18px rgba(29,34,96,0.38)', position: 'relative', zIndex: 1 },
  panel:  { background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0 -8px 36px rgba(0,0,0,0.09)', padding: '8px 20px 36px', flexShrink: 0, maxHeight: '46vh' },
  handle: { width: 36, height: 4, borderRadius: 2, background: '#E2E8F0', margin: '8px auto 18px' },
  routeBlock: { display: 'flex', gap: 14, marginBottom: 16 },
  routeCol:   { display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, flexShrink: 0 },
  dot:  { width: 11, height: 11, borderRadius: '50%', flexShrink: 0 },
  conn: { width: 2, flex: 1, minHeight: 22, margin: '5px 0', borderRadius: 2, background: 'linear-gradient(to bottom,#22C55E,#EF4444)', opacity: 0.3 },
  addrs:   { flex: 1, display: 'flex', flexDirection: 'column', gap: 14 },
  addrLbl: { margin: '0 0 2px', fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' },
  addrTxt: { margin: 0, fontSize: 13, fontWeight: 500, color: '#0F172A', lineHeight: 1.45 },
  divider: { height: 1, background: '#F1F5F9', margin: '0 0 16px' },
  driverRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 },
  avImg:  { width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #E2E8F0', display: 'block' },
  avInit: { width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#1d2260,#2e3699)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700 },
  online: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%', border: '2px solid #fff' },
  dName:  { margin: '0 0 3px', fontSize: 15, fontWeight: 700, color: '#0F172A' },
  dSub:   { margin: 0, fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  brand:  { margin: '16px 0 0', textAlign: 'center', fontSize: 11, color: '#CBD5E1', fontWeight: 500, letterSpacing: '0.3px' },
};