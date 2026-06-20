import { useState, useRef, useCallback } from 'react';
import { useDrivers } from './hooks/useDrivers';
import { useSettings } from './hooks/useSettings';
import { usePendingPassengers } from './hooks/usePendingPassengers';
import { useQueuedPassengers } from './hooks/useQueuedPassengers';
import { useScheduledTrips } from './hooks/useScheduledTrips';
import { useToast } from './context/ToastContext';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import DriverPanel from './components/DriverPanel';
import TripAssignModal from './components/TripAssignModal';
import NewTripModal from './components/NewTripModal';
import DriverManagement from './components/DriverManagement';
import ZoneManagement from './components/ZoneManagement';
import BroadcastVoiceChat from './components/BroadcastVoiceChat';
import QueuePanel from './components/QueuePanel';
import ScheduledTripsPanel from './components/ScheduledTripsPanel';
import StatisticsPanel from './components/StatisticsPanel';
import EmulatorGpsSimulator from './components/EmulatorGpsSimulator';
import { useTripStatistics } from './hooks/useTripStatistics';

// ─── Vista activa ─────────────────────────────────────────────────────────────
const VIEWS = {
  map:        'map',
  queue:      'queue',
  scheduled:  'scheduled',
  management: 'management',
  zones:      'zones',
  statistics: 'statistics',
  emulatorGps: 'emulatorGps',
};

export default function App() {
  const toast = useToast();
  const { drivers, loading } = useDrivers();
  const pendingPassengers = usePendingPassengers();
  const queueData = useQueuedPassengers();
  const scheduledData = useScheduledTrips();
  const {
    tariffPerKm, tariffBase, commissionPercent,
    passengerAppTariffPerKm, passengerAppTariffBase, passengerAppCommissionPercent,
    calculatePrice, updateSetting,
  } = useSettings();
  const tripStatistics = useTripStatistics('30d');

  const [selectedId,      setSelectedId]      = useState(null);
  const [panelDriverId,   setPanelDriverId]   = useState(null);
  const [tripModalDriver, setTripModalDriver] = useState(null);
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [currentView,     setCurrentView]     = useState(VIEWS.map);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelectedIds,setMultiSelectedIds]= useState(new Set());
  const [showBroadcast,   setShowBroadcast]   = useState(false);
  // Ruta de preview al asignar viaje: { polylineCoords, origin, destination } | null
  const [previewRoute,    setPreviewRoute]    = useState(null);

  const mapRef = useRef(null);

  // ── Selección múltiple ─────────────────────────────────────────────────────
  const toggleMultiSelect = useCallback((driverId) => {
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  }, []);

  const selectAllAvailable = useCallback(() => {
    const ids = drivers
      .filter((d) => d.isOnline && !d.activeTrip)
      .map((d) => d.id);
    setMultiSelectedIds(new Set(ids));
  }, [drivers]);

  const clearMultiSelect = useCallback(() => {
    setMultiSelectedIds(new Set());
    setMultiSelectMode(false);
    setShowBroadcast(false);
  }, []);

  const multiSelectedDrivers = drivers.filter((d) => multiSelectedIds.has(d.id));

  // ── Mapa ───────────────────────────────────────────────────────────────────
  const handleCenterDriver = useCallback((driver) => {
    if (mapRef.current && driver.lat && driver.lng) {
      mapRef.current.panTo({ lat: driver.lat, lng: driver.lng });
      mapRef.current.setZoom(16);
    }
  }, []);

  const handleCenterAll = useCallback(() => {
    if (!mapRef.current || drivers.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    drivers.forEach((d) => { if (d.lat && d.lng) bounds.extend({ lat: d.lat, lng: d.lng }); });
    mapRef.current.fitBounds(bounds, 60);
  }, [drivers]);

  const handleAssignTrip = useCallback((driver) => setTripModalDriver(driver), []);
  const handleTripSuccess = useCallback(() => {
    setTripModalDriver(null);
    toast.success('Viaje asignado al chofer correctamente');
  }, [toast]);

  const goTo = useCallback((view) => {
    setCurrentView(view);
    if (view !== VIEWS.map) {
      setPanelDriverId(null);
      setSelectedId(null);
    }
  }, []);

  const handleNewTripSuccess = useCallback(() => {
    setShowNewTripModal(false);
    queueData.refetch?.();
    goTo(VIEWS.queue);
    toast.success('Viaje encolado correctamente');
  }, [queueData, goTo, toast]);

  // ── Pantalla de carga ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-light-100">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-[3px] border-accent/20 rounded-full" />
            <div className="absolute inset-0 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-navy-900 text-sm font-semibold">Profesional Remises</p>
            <p className="text-gray-400 text-xs mt-0.5">Cargando operaciones...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">

      {/* ══════════════════════════════════════════════════════════════════════
          BARRA DE NAVEGACIÓN SUPERIOR
      ══════════════════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 h-[60px] bg-white/90 backdrop-blur-xl border-b border-light-300/50 flex items-center px-4 gap-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)] z-30">

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 flex-shrink-0 pr-3 border-r border-light-300/60">
          <div className="w-8 h-8 bg-gradient-to-br from-accent via-accent to-rose-700 rounded-[10px] flex items-center justify-center shadow-md shadow-accent/30 flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </svg>
          </div>
          <div className="leading-none">
            <p className="text-navy-900 font-extrabold text-[13px] tracking-tight">Profesional</p>
            <p className="text-[9px] text-gray-400 tracking-widest uppercase font-medium">Remises · Salta</p>
          </div>
        </div>

        {/* ── Espaciador ───────────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Navegación principal ─────────────────────────────────────── */}
        <nav className="flex items-center gap-1 bg-light-100/90 border border-light-300/50 rounded-2xl p-1 shadow-inner">

          <NavTab
            active={currentView === VIEWS.map}
            onClick={() => goTo(VIEWS.map)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            }
          >
            Mapa
          </NavTab>

          <NavTab
            active={currentView === VIEWS.queue}
            onClick={() => goTo(currentView === VIEWS.queue ? VIEWS.map : VIEWS.queue)}
            badge={queueData.stats.inQueue > 0 ? queueData.stats.inQueue : null}
            badgeColor="warning"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          >
            Cola
          </NavTab>

          <NavTab
            active={currentView === VIEWS.scheduled}
            onClick={() => goTo(currentView === VIEWS.scheduled ? VIEWS.map : VIEWS.scheduled)}
            badge={scheduledData.stats.total > 0 ? scheduledData.stats.total : null}
            badgeColor={scheduledData.stats.imminent > 0 ? 'warning-pulse' : 'violet'}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          >
            Programados
          </NavTab>

          <NavTab
            active={currentView === VIEWS.management}
            onClick={() => goTo(currentView === VIEWS.management ? VIEWS.map : VIEWS.management)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          >
            Choferes
          </NavTab>

          <NavTab
            active={currentView === VIEWS.statistics}
            onClick={() => goTo(currentView === VIEWS.statistics ? VIEWS.map : VIEWS.statistics)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          >
            Estadística
          </NavTab>

          <NavTab
            active={currentView === VIEWS.zones}
            onClick={() => goTo(currentView === VIEWS.zones ? VIEWS.map : VIEWS.zones)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            }
          >
            Zonas
          </NavTab>

          <NavTab
            active={currentView === VIEWS.emulatorGps}
            onClick={() => goTo(currentView === VIEWS.emulatorGps ? VIEWS.map : VIEWS.emulatorGps)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
          >
            Sim. GPS
          </NavTab>
        </nav>

        {/* ── Acciones secundarias ─────────────────────────────────────── */}
        <div className="flex items-center gap-1 pl-2 border-l border-light-300/60">
          <button
            type="button"
            onClick={() => setShowNewTripModal(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-accent text-white text-[12px] font-semibold shadow-sm shadow-accent/30 hover:bg-accent/90 transition-all"
            title="Agregar viaje a la cola"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo viaje
          </button>

          <IconAction
            active={multiSelectMode}
            title={multiSelectMode ? `Selección activa (${multiSelectedIds.size})` : 'Selección múltiple'}
            badge={multiSelectMode && multiSelectedIds.size > 0 ? multiSelectedIds.size : 0}
            onClick={() => {
              if (multiSelectMode) clearMultiSelect();
              else {
                setMultiSelectMode(true);
                setPanelDriverId(null);
                setSelectedId(null);
              }
            }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </IconAction>

          <IconAction
            active={showBroadcast}
            title="Audio masivo a choferes disponibles"
            onClick={() => {
              setMultiSelectMode(true);
              selectAllAvailable();
              setShowBroadcast(true);
              setPanelDriverId(null);
              setSelectedId(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </IconAction>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          CONTENIDO PRINCIPAL
      ══════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 min-h-0 flex overflow-hidden">

        {currentView === VIEWS.management ? (
          <DriverManagement onBack={() => goTo(VIEWS.map)} />

        ) : currentView === VIEWS.zones ? (
          <ZoneManagement onBack={() => goTo(VIEWS.map)} />

        ) : currentView === VIEWS.queue ? (
          <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
            <QueuePanel {...queueData} onBack={() => goTo(VIEWS.map)} />
          </div>

        ) : currentView === VIEWS.scheduled ? (
          <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
            <ScheduledTripsPanel
              {...scheduledData}
              onBack={() => goTo(VIEWS.map)}
            />
          </div>

        ) : currentView === VIEWS.statistics ? (
          <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
            <StatisticsPanel
              {...tripStatistics}
              drivers={drivers}
            />
          </div>

        ) : currentView === VIEWS.emulatorGps ? (
          <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
            <EmulatorGpsSimulator onBack={() => goTo(VIEWS.map)} />
          </div>

        ) : (
          /* ── Vista mapa ──────────────────────────────────────────────── */
          <>
            <Sidebar
              drivers={drivers}
              selectedId={selectedId}
              onSelectDriver={(id) => { setSelectedId(id); setPanelDriverId(id); }}
              onCenterDriver={handleCenterDriver}
              tariffPerKm={tariffPerKm}
              tariffBase={tariffBase}
              commissionPercent={commissionPercent}
              passengerAppTariffPerKm={passengerAppTariffPerKm}
              passengerAppTariffBase={passengerAppTariffBase}
              passengerAppCommissionPercent={passengerAppCommissionPercent}
              onUpdateSetting={updateSetting}
            />

            <div className="flex-1 relative min-h-0 rounded-tl-3xl overflow-hidden border-t border-l border-light-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <MapView
                drivers={drivers}
                pendingPassengers={pendingPassengers}
                selectedId={selectedId}
                onSelectDriver={setSelectedId}
                mapRef={mapRef}
                onAssignTrip={handleAssignTrip}
                multiSelectMode={multiSelectMode}
                multiSelectedIds={multiSelectedIds}
                onToggleMultiSelect={toggleMultiSelect}
                previewRoute={previewRoute}
              />

              {/* ── Banner de selección múltiple ─────────────────────── */}
              {multiSelectMode && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                  <div className="flex items-center gap-2.5 bg-white/97 backdrop-blur-md border border-light-300/60 rounded-2xl shadow-2xl shadow-navy-900/10 px-4 py-2.5">
                    <div className="flex items-center gap-2 pr-3 border-r border-light-300/60">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                      </span>
                      <span className="text-xs font-semibold text-navy-900">Selección activa</span>
                    </div>

                    <span className="text-xs text-gray-500 tabular-nums">
                      {multiSelectedIds.size} seleccionado{multiSelectedIds.size !== 1 ? 's' : ''}
                    </span>

                    <button
                      onClick={selectAllAvailable}
                      className="text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors px-2 py-1 rounded-lg hover:bg-accent/5"
                    >
                      Todos disponibles
                    </button>

                    {multiSelectedIds.size > 0 && (
                      <button
                        onClick={() => setShowBroadcast(true)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-accent hover:bg-accent/90 px-3 py-1.5 rounded-xl transition-all shadow-sm shadow-accent/30"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                        Enviar audio
                      </button>
                    )}

                    <button
                      onClick={clearMultiSelect}
                      className="w-7 h-7 rounded-lg bg-light-200 hover:bg-light-300 flex items-center justify-center text-gray-400 hover:text-danger transition-all"
                      title="Salir de selección"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Indicadores flotantes de alertas ─────────────────── */}
              <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2 items-end pointer-events-none">
                {scheduledData.stats.imminent > 0 && (
                  <button
                    className="pointer-events-auto flex items-center gap-2 bg-white border border-warning/40 shadow-lg shadow-warning/15 rounded-xl px-3 py-2 transition-all hover:shadow-xl hover:border-warning/60"
                    onClick={() => goTo(VIEWS.scheduled)}
                    title="Ver viajes inminentes"
                  >
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
                    </span>
                    <span className="text-[12px] font-bold text-warning">
                      {scheduledData.stats.imminent} viaje{scheduledData.stats.imminent !== 1 ? 's' : ''} programado{scheduledData.stats.imminent !== 1 ? 's' : ''} inminente{scheduledData.stats.imminent !== 1 ? 's' : ''}
                    </span>
                    <svg className="w-3.5 h-3.5 text-warning/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                {queueData.stats.inQueue > 0 && (
                  <button
                    className="pointer-events-auto flex items-center gap-2 bg-white border border-accent/30 shadow-lg shadow-accent/10 rounded-xl px-3 py-2 transition-all hover:shadow-xl hover:border-accent/50"
                    onClick={() => goTo(VIEWS.queue)}
                    title="Ver cola de espera"
                  >
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
                    </span>
                    <span className="text-[12px] font-bold text-accent">
                      {queueData.stats.inQueue} en cola de espera
                    </span>
                    <svg className="w-3.5 h-3.5 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* ── Panel de chofer ───────────────────────────────────── */}
            {panelDriverId && (
              <DriverPanel
                driver={drivers.find((d) => d.id === panelDriverId)}
                onClose={() => { setPanelDriverId(null); setSelectedId(null); }}
                onAssignTrip={handleAssignTrip}
                commissionPercent={commissionPercent}
              />
            )}
          </>
        )}
      </main>

      {/* ── Modal de asignación de viaje ───────────────────────────────────── */}
      {tripModalDriver && (
        <TripAssignModal
          driver={tripModalDriver}
          onClose={() => { setTripModalDriver(null); setPreviewRoute(null); }}
          onSuccess={handleTripSuccess}
          calculatePrice={calculatePrice}
          tariffPerKm={tariffPerKm}
          tariffBase={tariffBase}
          commissionPercent={commissionPercent}
          onRouteChange={setPreviewRoute}
        />
      )}

      {showNewTripModal && (
        <NewTripModal
          onClose={() => setShowNewTripModal(false)}
          onSuccess={handleNewTripSuccess}
        />
      )}

      {/* ── Broadcast de audio ─────────────────────────────────────────────── */}
      {showBroadcast && multiSelectedDrivers.length > 0 && (
        <BroadcastVoiceChat
          drivers={multiSelectedDrivers}
          onClose={() => setShowBroadcast(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componentes de navegación
// ─────────────────────────────────────────────────────────────────────────────

function NavTab({ children, icon, active, onClick, badge, badgeColor = 'warning' }) {
  const badgeStyles = {
    warning:       'bg-warning text-white',
    'warning-pulse': 'bg-warning text-white animate-pulse',
    violet:        'bg-violet-500 text-white',
    accent:        'bg-accent text-white',
  };

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12.5px] font-medium transition-all duration-150 ${
        active
          ? 'bg-white text-navy-900 shadow-sm shadow-navy-900/8 border border-light-300/60'
          : 'text-gray-500 hover:text-navy-800 hover:bg-white/60'
      }`}
    >
      {icon}
      <span>{children}</span>
      {badge != null && badge > 0 && (
        <span className={`min-w-[17px] h-[17px] flex items-center justify-center text-[9px] font-bold rounded-full px-1 -mr-0.5 ${badgeStyles[badgeColor] || badgeStyles.warning}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function IconAction({ children, active, onClick, title, badge = 0 }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 ${
        active
          ? 'bg-navy-900 text-white shadow-sm'
          : 'text-gray-400 hover:text-navy-800 hover:bg-light-200'
      }`}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold bg-violet-500 text-white rounded-full shadow-sm">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
