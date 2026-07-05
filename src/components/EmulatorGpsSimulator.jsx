'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { EMULATOR_GPS_DEFAULT_ORIGIN, DEFAULT_ZOOM } from '../lib/constants';
import { MAP_STYLE, DEFAULT_MAP_VIEW, mapLibreOptions } from '../lib/mapLibre';

const MARKER_COLOR = '#DC2626';
const THROTTLE_MS = 200;
const DRIVER_STORAGE_KEY = 'emulator-sim-driver-id';

const SIM_MAP_CSS = `
.sim-gps-marker.maplibregl-marker { z-index: 20 !important; }
.sim-gps-marker .maplibregl-marker-anchor { cursor: grab; }
`;

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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">
      <path fill="${MARKER_COLOR}" stroke="#fff" stroke-width="2"
        d="M22 2C12.06 2 4 10.06 4 20c0 11.25 18 33 18 33s18-21.75 18-33C40 10.06 31.94 2 22 2z"/>
      <circle cx="22" cy="20" r="9" fill="#fff"/>
      <text x="22" y="24" text-anchor="middle" font-size="9" font-weight="700" fill="${MARKER_COLOR}" font-family="system-ui,sans-serif">A</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function SimMarkerPin({ dragging = false }) {
  return (
    <div
      className="select-none"
      style={{
        width: 44,
        height: 56,
        cursor: dragging ? 'grabbing' : 'grab',
        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.4))',
        pointerEvents: 'auto',
      }}
    >
      <img
        src={buildMarkerIcon()}
        alt="Marcador GPS"
        width={44}
        height={56}
        draggable={false}
        style={{ display: 'block' }}
      />
    </div>
  );
}

export default function EmulatorGpsSimulator({ onBack }) {
  const mapRef = useRef(null);
  const throttleRef = useRef(null);
  const pendingRef = useRef(null);
  const seededForDeviceRef = useRef(null);
  const driverOriginRef = useRef(null);
  const selectedDriverIdRef = useRef('');
  const isDraggingRef = useRef(false);
  const mapCenterSetRef = useRef(false);

  const [adbInfo, setAdbInfo] = useState(null);
  const [emulator, setEmulator] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [driverOrigin, setDriverOrigin] = useState(null);
  const [viewState, setViewState] = useState({
    ...DEFAULT_MAP_VIEW,
    longitude: EMULATOR_GPS_DEFAULT_ORIGIN.lng,
    latitude: EMULATOR_GPS_DEFAULT_ORIGIN.lat,
    zoom: DEFAULT_ZOOM + 2,
  });

  const [position, setPosition] = useState(EMULATOR_GPS_DEFAULT_ORIGIN);
  const [trail, setTrail] = useState([]);

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

  const [lastError, setLastError] = useState('');
  const [lastOkAt, setLastOkAt] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [pollError, setPollError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [gpsSimulationActive, setGpsSimulationActive] = useState(false);
  const [togglingSimulation, setTogglingSimulation] = useState(false);

  const markerLat = Number(position.lat);
  const markerLng = Number(position.lng);
  const hasValidPosition = Number.isFinite(markerLat) && Number.isFinite(markerLng);

  const centerMapOnPosition = useCallback((originPos, { animated = true } = {}) => {
    if (!Number.isFinite(originPos?.lat) || !Number.isFinite(originPos?.lng)) return;
    setViewState((vs) => ({
      ...vs,
      longitude: originPos.lng,
      latitude: originPos.lat,
      zoom: 17,
    }));
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [originPos.lng, originPos.lat],
        zoom: 17,
        duration: animated ? 450 : 0,
      });
      mapCenterSetRef.current = true;
    }
  }, []);

  const emulatorRef = useRef(null);
  useEffect(() => {
    emulatorRef.current = emulator;
  }, [emulator]);

  const pushSimulatedPosition = useCallback(async (lat, lng, { updateUi = true } = {}) => {
    const driverId = selectedDriverIdRef.current || driverOriginRef.current?.driverId;
    if (!driverId) {
      if (updateUi) setLastError('Seleccioná un chofer para simular');
      return;
    }

    const showUi = updateUi && !isDraggingRef.current;
    if (showUi) setSyncing(true);

    try {
      const body = {
        driverId,
        latitude: lat,
        longitude: lng,
      };
      const emu = emulatorRef.current;
      if (emu?.id) body.deviceId = emu.id;

      const res = await fetch('/api/dev/emulator-gps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar ubicación');

      if (showUi) {
        setLastError('');
        setLastOkAt(Date.now());
      }
    } catch (err) {
      if (updateUi) setLastError(err.message || 'No se pudo actualizar la ubicación');
    } finally {
      if (showUi) setSyncing(false);
    }
  }, []);

  const applyOrigin = useCallback((originPos, { panMap = true, force = false, sync = true } = {}) => {
    if (isDraggingRef.current && !force) return;
    setPosition(originPos);
    setTrail([originPos]);
    if (panMap) centerMapOnPosition(originPos);
    if (sync) pushSimulatedPosition(originPos.lat, originPos.lng, { updateUi: false });
  }, [pushSimulatedPosition, centerMapOnPosition]);

  const schedulePositionSync = useCallback((lat, lng, { immediate = false } = {}) => {
    pendingRef.current = { lat, lng };

    const flush = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      pushSimulatedPosition(pending.lat, pending.lng, { updateUi: !isDraggingRef.current });
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
  }, [pushSimulatedPosition]);

  const refreshEmulators = useCallback(async ({ fetchDriverOrigin = false, driverId } = {}) => {
    const activeDriverId = driverId || selectedDriverIdRef.current || undefined;
    const query = activeDriverId ? `?driverId=${encodeURIComponent(activeDriverId)}` : '';

    try {
      const res = await fetch(`/api/dev/emulator-gps${query}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setPollError(data.error || 'API no disponible');
        setEmulator(null);
        seededForDeviceRef.current = null;
        return null;
      }
      setPollError('');
      setAdbInfo(data.adb);

      if (Array.isArray(data.drivers)) {
        setDrivers(data.drivers);
      }

      const primary = pickPrimaryEmulator(data.emulators || []);

      setEmulator((prev) => {
        if (prev?.id === primary?.id) return prev;
        if (prev?.id !== primary?.id) seededForDeviceRef.current = null;
        return primary;
      });

      if (fetchDriverOrigin && data.driverOrigin) {
        driverOriginRef.current = data.driverOrigin;
        setDriverOrigin(data.driverOrigin);
        setGpsSimulationActive(Boolean(data.driverOrigin.gpsSimulationActive));
        if (!activeDriverId && data.driverOrigin.driverId) {
          setSelectedDriverId(data.driverOrigin.driverId);
          selectedDriverIdRef.current = data.driverOrigin.driverId;
        }
      }

      return { emulator: primary, driverOrigin: data.driverOrigin, drivers: data.drivers };
    } catch (err) {
      setPollError(err.message || 'Error al listar emuladores');
      return null;
    }
  }, []);

  useEffect(() => {
    const storedId = typeof window !== 'undefined'
      ? window.localStorage.getItem(DRIVER_STORAGE_KEY)
      : null;
    if (storedId) {
      setSelectedDriverId(storedId);
      selectedDriverIdRef.current = storedId;
    }

    refreshEmulators({ fetchDriverOrigin: true, driverId: storedId || undefined });
    const id = setInterval(() => {
      refreshEmulators({ fetchDriverOrigin: false });
    }, 8000);
    return () => clearInterval(id);
  }, [refreshEmulators]);

  const handleDriverChange = useCallback(async (event) => {
    const driverId = event.target.value;
    setSelectedDriverId(driverId);
    selectedDriverIdRef.current = driverId;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DRIVER_STORAGE_KEY, driverId);
    }
    seededForDeviceRef.current = null;
    isDraggingRef.current = false;
    mapCenterSetRef.current = false;
    const fresh = await refreshEmulators({ fetchDriverOrigin: true, driverId });
    if (fresh?.driverOrigin) {
      setGpsSimulationActive(Boolean(fresh.driverOrigin.gpsSimulationActive));
    }
  }, [refreshEmulators]);

  const handleToggleSimulation = useCallback(async () => {
    const driverId = selectedDriverIdRef.current || driverOriginRef.current?.driverId;
    if (!driverId) return;

    const nextActive = !gpsSimulationActive;
    setTogglingSimulation(true);
    setLastError('');

    try {
      const res = await fetch('/api/dev/emulator-gps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, active: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la simulación');

      setGpsSimulationActive(nextActive);
      if (driverOriginRef.current) {
        driverOriginRef.current = {
          ...driverOriginRef.current,
          gpsSimulationActive: nextActive,
        };
        setDriverOrigin(driverOriginRef.current);
      }
    } catch (err) {
      setLastError(err.message || 'Error al cambiar simulación remota');
    } finally {
      setTogglingSimulation(false);
    }
  }, [gpsSimulationActive]);

  /** Centrar mapa y marcador en la ubicación del chofer (BD), aunque no haya emulador. */
  useEffect(() => {
    if (!driverOrigin) return;
    const originPos = originToMapPosition(driverOrigin);
    if (isDraggingRef.current) return;

    setPosition(originPos);
    setTrail((prev) => (prev.length > 1 ? prev : [originPos]));
    centerMapOnPosition(originPos);
  }, [driverOrigin, centerMapOnPosition]);

  const handleMapLoad = useCallback((event) => {
    mapRef.current = event.target;
    const origin = driverOriginRef.current;
    const pos = origin ? originToMapPosition(origin) : EMULATOR_GPS_DEFAULT_ORIGIN;
    centerMapOnPosition(pos, { animated: false });
  }, [centerMapOnPosition]);

  useEffect(() => {
    if (!emulator?.id) return;
    const origin = driverOriginRef.current;
    if (!origin) return;
    if (seededForDeviceRef.current === emulator.id) return;

    seededForDeviceRef.current = emulator.id;
    applyOrigin(originToMapPosition(origin), { force: true, sync: true });
  }, [emulator?.id, driverOrigin, applyOrigin]);

  const commitPosition = useCallback((lat, lng, { appendTrail = true, immediate = false } = {}) => {
    setPosition({ lat, lng });
    if (appendTrail) {
      setTrail((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.lat === lat && last.lng === lng) return prev.length ? prev : [{ lat, lng }];
        return [...prev, { lat, lng }].slice(-200);
      });
    }
    schedulePositionSync(lat, lng, { immediate });
  }, [schedulePositionSync]);

  const handleMapClick = useCallback((event) => {
    if (isDraggingRef.current) return;
    const lat = event.lngLat.lat;
    const lng = event.lngLat.lng;
    commitPosition(lat, lng, { immediate: true });
  }, [commitPosition]);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setIsDragging(true);
  }, []);

  const handleDrag = useCallback((event) => {
    const lat = event.lngLat.lat;
    const lng = event.lngLat.lng;
    setPosition({ lat, lng });
    schedulePositionSync(lat, lng);
  }, [schedulePositionSync]);

  const handleDragEnd = useCallback((event) => {
    const lat = event.lngLat.lat;
    const lng = event.lngLat.lng;
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    pendingRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);
    commitPosition(lat, lng, { immediate: true });
  }, [commitPosition]);

  const clearTrail = useCallback(() => {
    setTrail(position ? [position] : []);
  }, [position]);

  const resetToOrigin = useCallback(async () => {
    isDraggingRef.current = false;
    const fresh = await refreshEmulators({
      fetchDriverOrigin: true,
      driverId: selectedDriverId || undefined,
    });
    const origin = fresh?.driverOrigin || driverOriginRef.current || driverOrigin;
    applyOrigin(originToMapPosition(origin), { force: true, sync: false });
  }, [refreshEmulators, applyOrigin, driverOrigin, selectedDriverId]);

  const dbOriginPos = originToMapPosition(driverOrigin);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-light-100/50">
      <style>{SIM_MAP_CSS}</style>
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
            Arrastrá el pin o hacé clic en el mapa — actualiza current_lat/lng en Supabase
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshEmulators({ fetchDriverOrigin: true })}
          className="h-8 px-3 rounded-xl text-[12px] font-semibold bg-light-200 hover:bg-light-300 text-navy-800 transition-colors"
        >
          Actualizar
        </button>
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <aside className="w-[300px] flex-shrink-0 border-r border-light-300/60 bg-white overflow-y-auto p-4 space-y-4">
          <section className="rounded-2xl border border-light-300/60 p-3.5 bg-light-50/80">
            <label htmlFor="sim-driver-select" className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 block">
              Chofer a simular
            </label>
            {drivers.length === 0 ? (
              <p className="text-[11px] text-gray-500">Cargando choferes…</p>
            ) : (
              <select
                id="sim-driver-select"
                value={selectedDriverId || driverOrigin?.driverId || ''}
                onChange={handleDriverChange}
                className="w-full h-9 rounded-xl border border-light-300/80 bg-white px-2.5 text-[12px] font-medium text-navy-900 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    #{driver.driverNumber} — {driver.fullName}
                    {driver.vehiclePlate ? ` (${driver.vehiclePlate})` : ''}
                    {!driver.hasLocation ? ' · sin ubicación' : ''}
                    {!driver.isAvailable ? ' · offline' : ''}
                  </option>
                ))}
              </select>
            )}
            {driverOrigin?.fullName && (
              <div className="mt-3 pt-3 border-t border-light-300/60">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-navy-900">Simulación remota (APK)</p>
                    <p className="text-[10px] text-gray-500 leading-snug">
                      {gpsSimulationActive
                        ? 'Activa: el celular sigue esta ubicación'
                        : 'Inactiva: el celular usa GPS real'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={gpsSimulationActive}
                    disabled={togglingSimulation || !selectedDriverId}
                    onClick={handleToggleSimulation}
                    className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
                      gpsSimulationActive ? 'bg-accent' : 'bg-light-300'
                    } disabled:opacity-50`}
                    title={gpsSimulationActive ? 'Desactivar simulación remota' : 'Activar simulación remota'}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        gpsSimulationActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </section>

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
              <div className="rounded-2xl border border-dashed border-light-300 p-4 text-center space-y-3">
                <p className="text-[12px] text-gray-500 leading-relaxed">
                  Sin emulador ADB: simulación vía Supabase (APK en celular). Arrastrá el pin o tocá el mapa.
                </p>
                <p className="text-[10px] text-warning leading-relaxed">
                  {gpsSimulationActive
                    ? 'Simulación remota ON: el APK sigue el pin. Desactivá el toggle al terminar.'
                    : 'Activá "Simulación remota" para que el APK siga el pin sin pelear con el GPS real.'}
                </p>
                <button
                  type="button"
                  onClick={resetToOrigin}
                  className="w-full h-8 rounded-xl text-[11px] font-semibold bg-white border border-light-300/80 text-navy-800 hover:bg-light-50 transition-colors"
                >
                  Centrar en ubicación del chofer (BD)
                </button>
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
              . Cada movimiento actualiza{' '}
              <code className="text-[10px] bg-white/80 px-1 rounded">current_lat/lng</code>
              {emulator ? (
                <> y <code className="text-[10px] bg-white/80 px-1 rounded">adb emu geo fix</code></>
              ) : (
                <> en Supabase (visible en mapa y tracking)</>
              )}
              .
            </p>
          </section>
        </aside>

        <div className="flex-1 relative min-h-0">
          <Map
            ref={mapRef}
            {...viewState}
            onMove={(event) => setViewState(event.viewState)}
            mapStyle={MAP_STYLE}
            style={{ width: '100%', height: '100%' }}
            onLoad={handleMapLoad}
            onClick={handleMapClick}
            dragPan={!isDragging}
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

            {hasValidPosition ? (
              <Marker
                className="sim-gps-marker"
                longitude={markerLng}
                latitude={markerLat}
                anchor="bottom"
                draggable
                onDragStart={handleDragStart}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
              >
                <SimMarkerPin dragging={isDragging} />
              </Marker>
            ) : null}
          </Map>

          <div className="absolute bottom-4 left-4 right-4 pointer-events-none flex justify-center">
            <div className="pointer-events-auto max-w-lg bg-white/95 backdrop-blur-md border border-light-300/60 rounded-2xl shadow-lg px-4 py-2.5 text-center">
              <p className="text-[11px] text-navy-800 font-medium">
                {gpsSimulationActive
                  ? 'Simulación remota activa: arrastrá el pin o hacé clic en el mapa'
                  : 'Activá "Simulación remota" y mové el pin para controlar el APK'}
                {syncing ? ' · guardando…' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
