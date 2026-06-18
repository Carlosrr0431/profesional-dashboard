'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { EMULATOR_GPS_DEFAULT_ORIGIN, DEFAULT_ZOOM } from '../lib/constants';
import { MAP_STYLE_URL, DEFAULT_MAP_VIEW, mapLibreOptions } from '../lib/mapLibre';

const MARKER_COLOR = '#DC2626';
const THROTTLE_MS = 120;

function pickPrimaryEmulator(list) {
  if (!list?.length) return null;
  return [...list].sort((a, b) => {
    const portA = Number.parseInt(String(a.id).replace('emulator-', ''), 10) || 0;
    const portB = Number.parseInt(String(b.id).replace('emulator-', ''), 10) || 0;
    return portA - portB;
  })[0];
}

function originToMapPosition(driverOrigin) {
  if (driverOrigin?.latitude != null && driverOrigin?.longitude != null) {
    return { lat: driverOrigin.latitude, lng: driverOrigin.longitude };
  }
  return { ...EMULATOR_GPS_DEFAULT_ORIGIN };
}

function formatCoord(value) {
  return Number(value).toFixed(8);
}

function buildMarkerIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">
      <path fill="${MARKER_COLOR}" stroke="#fff" stroke-width="2"
        d="M22 2C12.06 2 4 10.06 4 20c0 11.25 18 33 18 33s18-21.75 18-33C40 10.06 31.94 2 22 2z"/>
      <circle cx="22" cy="20" r="9" fill="#fff"/>
      <text x="22" y="24" text-anchor="middle" font-size="9" font-weight="700" fill="${MARKER_COLOR}" font-family="system-ui,sans-serif">A</text>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: 44, height: 56 },
    anchor: { x: 22, y: 54 },
  };
}

export default function EmulatorGpsSimulator({ onBack }) {
  const mapRef = useRef(null);
  const throttleRef = useRef(null);
  const pendingRef = useRef(null);
  const seededForDeviceRef = useRef(null);
  const driverOriginRef = useRef(null);
  const isDraggingRef = useRef(false);
  const mapCenterSetRef = useRef(false);

  const [adbInfo, setAdbInfo] = useState(null);
  const [emulator, setEmulator] = useState(null);
  const [driverOrigin, setDriverOrigin] = useState(null);
  const [viewState, setViewState] = useState({
    ...DEFAULT_MAP_VIEW,
    longitude: EMULATOR_GPS_DEFAULT_ORIGIN.lng,
    latitude: EMULATOR_GPS_DEFAULT_ORIGIN.lat,
    zoom: DEFAULT_ZOOM + 2,
  });

  const trailGeoJson = useMemo(() => {
    if (trail.length < 2) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: trail.map((p) => [p.lng, p.lat]),
      },
      properties: {},
    };
  }, [trail]);
  const [position, setPosition] = useState(EMULATOR_GPS_DEFAULT_ORIGIN);
  const [trail, setTrail] = useState([]);
  const [lastError, setLastError] = useState('');
  const [lastOkAt, setLastOkAt] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [pollError, setPollError] = useState('');

  const pushGps = useCallback(async (deviceId, lat, lng, { updateUi = true } = {}) => {
    if (!deviceId) return;
    const showUi = updateUi && !isDraggingRef.current;
    if (showUi) setSyncing(true);
    try {
      const res = await fetch('/api/dev/emulator-gps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, latitude: lat, longitude: lng }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar ubicación');
      if (showUi) {
        setLastError('');
        setLastOkAt(Date.now());
      }
    } catch (err) {
      setLastError(err.message || 'No se pudo actualizar el emulador');
    } finally {
      if (showUi) setSyncing(false);
    }
  }, []);

  const applyOrigin = useCallback((originPos, deviceId, { panMap = true, force = false } = {}) => {
    if (isDraggingRef.current && !force) return;
    setPosition(originPos);
    setTrail([originPos]);
    if (panMap && mapRef.current) {
      mapRef.current.flyTo({
        center: [originPos.lng, originPos.lat],
        zoom: 17,
        duration: 400,
      });
      mapCenterSetRef.current = true;
    }
    if (deviceId) pushGps(deviceId, originPos.lat, originPos.lng);
  }, [pushGps]);

  const scheduleGpsUpdate = useCallback((deviceId, lat, lng, { immediate = false } = {}) => {
    pendingRef.current = { deviceId, lat, lng };

    const flush = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      const dragging = isDraggingRef.current;
      pushGps(pending.deviceId, pending.lat, pending.lng, { updateUi: !dragging });
    };

    if (immediate) {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      flush();
      return;
    }

    if (throttleRef.current) return;
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      flush();
    }, THROTTLE_MS);
  }, [pushGps]);

  const refreshEmulators = useCallback(async ({ fetchDriverOrigin = false } = {}) => {
    try {
      const res = await fetch('/api/dev/emulator-gps', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setPollError(data.error || 'API no disponible');
        setEmulator(null);
        seededForDeviceRef.current = null;
        return null;
      }
      setPollError('');
      setAdbInfo(data.adb);
      const primary = pickPrimaryEmulator(data.emulators || []);

      setEmulator((prev) => {
        if (prev?.id === primary?.id) return prev;
        if (prev?.id !== primary?.id) seededForDeviceRef.current = null;
        return primary;
      });

      if (fetchDriverOrigin && data.driverOrigin) {
        driverOriginRef.current = data.driverOrigin;
        setDriverOrigin(data.driverOrigin);
      }

      return { emulator: primary, driverOrigin: data.driverOrigin };
    } catch (err) {
      setPollError(err.message || 'Error al listar emuladores');
      return null;
    }
  }, []);

  useEffect(() => {
    refreshEmulators({ fetchDriverOrigin: true });
    const id = setInterval(() => refreshEmulators({ fetchDriverOrigin: false }), 8000);
    return () => clearInterval(id);
  }, [refreshEmulators]);

  useEffect(() => {
    if (!emulator?.id) return;
    const origin = driverOriginRef.current;
    if (!origin) return;
    if (seededForDeviceRef.current === emulator.id) return;

    seededForDeviceRef.current = emulator.id;
    applyOrigin(originToMapPosition(origin), emulator.id, { force: true });
  }, [emulator?.id, driverOrigin, applyOrigin]);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDrag = useCallback((event) => {
    if (!emulator?.id) return;
    const lat = event.lngLat.lat;
    const lng = event.lngLat.lng;
    scheduleGpsUpdate(emulator.id, lat, lng);
  }, [emulator, scheduleGpsUpdate]);

  const handleDragEnd = useCallback((event) => {
    if (!emulator?.id) return;
    const lat = event.lngLat.lat;
    const lng = event.lngLat.lng;
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    pendingRef.current = null;
    isDraggingRef.current = false;
    setPosition({ lat, lng });
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.lat === lat && last.lng === lng) return prev;
      return [...prev, { lat, lng }].slice(-200);
    });
    pushGps(emulator.id, lat, lng, { updateUi: true });
  }, [emulator, pushGps]);

  const clearTrail = useCallback(() => {
    setTrail(position ? [position] : []);
  }, [position]);

  const resetToOrigin = useCallback(async () => {
    if (!emulator?.id) return;
    isDraggingRef.current = false;
    const fresh = await refreshEmulators({ fetchDriverOrigin: true });
    const origin = fresh?.driverOrigin || driverOriginRef.current || driverOrigin;
    applyOrigin(originToMapPosition(origin), emulator.id, { force: true });
  }, [emulator, refreshEmulators, applyOrigin, driverOrigin]);

  const dbOriginPos = originToMapPosition(driverOrigin);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-light-100/50">
      <header className="flex-shrink-0 h-14 px-4 flex items-center gap-3 border-b border-light-300/60 bg-white/90 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-xl bg-light-200 hover:bg-light-300 flex items-center justify-center text-gray-500 hover:text-navy-900 transition-colors"
          title="Volver al mapa"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-navy-900 tracking-tight">Simulador GPS (chofer)</h1>
          <p className="text-[11px] text-gray-400 truncate">
            Marcador A — arrastrá para simular el recorrido del emulador chofer
          </p>
        </div>
        <button
          type="button"
          onClick={refreshEmulators}
          className="h-8 px-3 rounded-xl text-[12px] font-semibold bg-light-200 hover:bg-light-300 text-navy-800 transition-colors"
        >
          Actualizar
        </button>
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <aside className="w-[300px] flex-shrink-0 border-r border-light-300/60 bg-white overflow-y-auto p-4 space-y-4">
          <section className="rounded-2xl border border-light-300/60 p-3.5 bg-light-50/80">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">ADB</p>
            {adbInfo?.ok ? (
              <p className="text-[11px] text-online font-medium break-all">{adbInfo.adbPath}</p>
            ) : (
              <p className="text-[11px] text-danger leading-relaxed">
                {pollError || adbInfo?.error || 'adb no encontrado. Definí ANDROID_HOME o ADB_PATH.'}
              </p>
            )}
            {lastOkAt && (
              <p className="text-[10px] text-gray-400 mt-2">
                Última sync: {new Date(lastOkAt).toLocaleTimeString('es-AR')}
              </p>
            )}
            {lastError && (
              <p className="text-[11px] text-danger mt-2">{lastError}</p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-navy-900">Emulador A (chofer)</p>
              <button
                type="button"
                onClick={clearTrail}
                className="text-[10px] font-semibold text-gray-400 hover:text-accent"
              >
                Limpiar recorrido
              </button>
            </div>

            {!emulator ? (
              <div className="rounded-2xl border border-dashed border-light-300 p-4 text-center">
                <p className="text-[12px] text-gray-500 leading-relaxed">
                  No hay emulador en ejecución. Iniciá el emulador del chofer (driver-app) y tocá Actualizar.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-accent/30 bg-accent/5 p-3">
                <div className="flex items-start gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full mt-1 flex-shrink-0 ring-2 ring-white shadow-sm"
                    style={{ backgroundColor: MARKER_COLOR }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-navy-900">{emulator.id}</p>
                    {driverOrigin?.fullName && (
                      <p className="text-[10px] text-gray-500 truncate">{driverOrigin.fullName}</p>
                    )}
                    {emulator.model && (
                      <p className="text-[10px] text-gray-400 truncate">{emulator.model}</p>
                    )}
                    <p className="text-[10px] text-gray-500 tabular-nums mt-1 break-all">
                      {formatCoord(position.lat)}, {formatCoord(position.lng)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {trail.length > 1 ? `${trail.length} puntos en el recorrido` : 'Sin recorrido aún'}
                      {syncing && ' · enviando…'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetToOrigin}
                  className="mt-3 w-full h-8 rounded-xl text-[11px] font-semibold bg-white border border-light-300/80 text-navy-800 hover:bg-light-50 transition-colors"
                >
                  Volver al origen del chofer (desde BD)
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-navy-900/5 border border-navy-900/10 p-3">
            <p className="text-[11px] text-navy-800 leading-relaxed">
              <span className="font-semibold">Origen en BD</span>
              {driverOrigin?.fullName ? ` (${driverOrigin.fullName})` : ''}:{' '}
              <span className="tabular-nums">{formatCoord(dbOriginPos.lat)}, {formatCoord(dbOriginPos.lng)}</span>
              {driverOrigin?.source && (
                <span className="text-gray-500"> · tabla {driverOrigin.source}</span>
              )}
              . Chofer nº {driverOrigin?.driverNumber ?? 2} por defecto. Cada arrastre ejecuta{' '}
              <code className="text-[10px] bg-white/80 px-1 rounded">adb emu geo fix</code>.
            </p>
          </section>
        </aside>

        <div className="flex-1 relative min-h-0">
          <Map
            ref={mapRef}
            {...viewState}
            onMove={(event) => setViewState(event.viewState)}
            mapStyle={MAP_STYLE_URL}
            style={{ width: '100%', height: '100%' }}
            onLoad={(event) => { mapRef.current = event.target; }}
            {...mapLibreOptions}
          >
            {trailGeoJson ? (
              <Source id="emulator-trail" type="geojson" data={trailGeoJson}>
                <Layer
                  id="emulator-trail-line"
                  type="line"
                  paint={{
                    'line-color': MARKER_COLOR,
                    'line-width': 4,
                    'line-opacity': 0.75,
                  }}
                />
              </Source>
            ) : null}

            {emulator ? (
              <Marker
                longitude={position.lng}
                latitude={position.lat}
                anchor="bottom"
                draggable
                onDragStart={handleDragStart}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
              >
                <img
                  src={buildMarkerIcon().url}
                  alt="Emulador GPS"
                  width={44}
                  height={56}
                  style={{ cursor: 'grab' }}
                />
              </Marker>
            ) : null}
          </Map>

          <div className="absolute bottom-4 left-4 right-4 pointer-events-none flex justify-center">
            <div className="pointer-events-auto max-w-lg bg-white/95 backdrop-blur-md border border-light-300/60 rounded-2xl shadow-lg px-4 py-2.5 text-center">
              <p className="text-[11px] text-navy-800 font-medium">
                Arrastrá el marcador A sobre calles reales para simular el viaje del chofer
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
