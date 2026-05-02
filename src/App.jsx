import { useState, useRef, useCallback, useEffect } from 'react';
import { useDrivers } from './hooks/useDrivers';
import { useSettings } from './hooks/useSettings';
import { usePendingPassengers } from './hooks/usePendingPassengers';
import { useQueuedPassengers } from './hooks/useQueuedPassengers';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import DriverPanel from './components/DriverPanel';
import TripAssignModal from './components/TripAssignModal';
import DriverManagement from './components/DriverManagement';
import ZoneManagement from './components/ZoneManagement';
import BroadcastVoiceChat from './components/BroadcastVoiceChat';
import QueuePanel from './components/QueuePanel';

export default function App() {
  const { drivers, loading } = useDrivers();
  const pendingPassengers = usePendingPassengers();
  const queueData = useQueuedPassengers();
  const {
    tariffPerKm,
    tariffBase,
    commissionPercent,
    whatsappAmtFare,
    whatsappDriverCommission,
    calculatePrice,
    updateSetting,
  } = useSettings();
  const [selectedId, setSelectedId] = useState(null);
  const [panelDriverId, setPanelDriverId] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [tripModalDriver, setTripModalDriver] = useState(null);
  const [currentView, setCurrentView] = useState('map');
  const mapRef = useRef(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelectedIds, setMultiSelectedIds] = useState(new Set());
  const [showBroadcast, setShowBroadcast] = useState(false);

  const toggleMultiSelect = useCallback((driverId) => {
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  }, []);

  const selectAllAvailable = useCallback(() => {
    const availableIds = drivers
      .filter((driver) => driver.isOnline && !driver.activeTrip)
      .map((driver) => driver.id);
    setMultiSelectedIds(new Set(availableIds));
  }, [drivers]);

  const clearMultiSelect = useCallback(() => {
    setMultiSelectedIds(new Set());
    setMultiSelectMode(false);
    setShowBroadcast(false);
  }, []);

  const multiSelectedDrivers = drivers.filter((driver) => multiSelectedIds.has(driver.id));

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCenterDriver = useCallback((driver) => {
    if (mapRef.current && driver.lat && driver.lng) {
      mapRef.current.panTo({ lat: driver.lat, lng: driver.lng });
      mapRef.current.setZoom(16);
    }
  }, []);

  const handleCenterAll = useCallback(() => {
    if (!mapRef.current || drivers.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    drivers.forEach((driver) => {
      if (driver.lat && driver.lng) bounds.extend({ lat: driver.lat, lng: driver.lng });
    });
    mapRef.current.fitBounds(bounds, 60);
  }, [drivers]);

  const handleAssignTrip = useCallback((driver) => {
    setTripModalDriver(driver);
  }, []);

  const handleTripSuccess = useCallback(() => {
    setTripModalDriver(null);
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-light-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  const timeStr = clock.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = clock.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-light-200">

      {/* ── Barra de navegación superior ───────────────────────────────────── */}
      <header className="flex-shrink-0 h-[60px] bg-white border-b border-light-300/60 flex items-center px-5 gap-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">

        {/* Marca */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent-light rounded-xl flex items-center justify-center shadow-md shadow-accent/25 flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </svg>
          </div>
          <span className="text-navy-900 font-bold text-sm tracking-tight">Profesional</span>
        </div>

        <div className="h-5 w-px bg-light-300 flex-shrink-0" />

        {/* Stats en línea */}
        <StatsBar drivers={drivers} />

        {/* Espacio flexible */}
        <div className="flex-1" />

        {/* Navegación principal */}
        <nav className="flex items-center gap-0.5">
          <NavTab
            active={currentView === 'map'}
            onClick={() => setCurrentView('map')}
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>}
          >Mapa</NavTab>

          <NavTab
            active={currentView === 'queue'}
            onClick={() => setCurrentView(currentView === 'queue' ? 'map' : 'queue')}
            badge={queueData.stats.inQueue > 0 ? queueData.stats.inQueue : null}
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          >Cola</NavTab>

          <NavTab
            active={currentView === 'management'}
            onClick={() => setCurrentView(currentView === 'management' ? 'map' : 'management')}
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          >Choferes</NavTab>

          <NavTab
            active={currentView === 'zones'}
            onClick={() => setCurrentView(currentView === 'zones' ? 'map' : 'zones')}
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>}
          >Zonas</NavTab>
        </nav>

        <div className="h-5 w-px bg-light-300 flex-shrink-0" />

        {/* Acciones secundarias — solo icono */}
        <div className="flex items-center gap-1">
          <IconAction
            active={multiSelectMode}
            title={multiSelectMode ? `Selección activa (${multiSelectedIds.size})` : 'Seleccionar choferes'}
            badge={multiSelectMode && multiSelectedIds.size > 0 ? multiSelectedIds.size : 0}
            onClick={() => {
              if (multiSelectMode) clearMultiSelect();
              else { setMultiSelectMode(true); setPanelDriverId(null); setSelectedId(null); }
            }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </IconAction>

          <IconAction
            active={showBroadcast}
            title="Audio masivo a todos los disponibles"
            onClick={() => {
              setMultiSelectMode(true);
              selectAllAvailable();
              setShowBroadcast(true);
              setPanelDriverId(null);
              setSelectedId(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </IconAction>
        </div>

        <div className="h-5 w-px bg-light-300 flex-shrink-0" />

        {/* Reloj */}
        <div className="flex-shrink-0 text-right">
          <p className="text-navy-900 text-[13px] font-bold tabular-nums leading-none">{timeStr}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{dateStr}</p>
        </div>
      </header>

      {/* ── Contenido principal ─────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {currentView === 'management' ? (
          <DriverManagement onBack={() => setCurrentView('map')} />
        ) : currentView === 'zones' ? (
          <ZoneManagement onBack={() => setCurrentView('map')} />
        ) : currentView === 'queue' ? (
          <QueuePanel
            {...queueData}
            onBack={() => setCurrentView('map')}
          />
        ) : (
          <>
            <Sidebar
              drivers={drivers}
              selectedId={selectedId}
              onSelectDriver={(id) => {
                setSelectedId(id);
                setPanelDriverId(id);
              }}
              onCenterDriver={handleCenterDriver}
              tariffPerKm={tariffPerKm}
              tariffBase={tariffBase}
              commissionPercent={commissionPercent}
              whatsappAmtFare={whatsappAmtFare}
              whatsappDriverCommission={whatsappDriverCommission}
              onUpdateSetting={updateSetting}
            />
            <div className="flex-1 relative">
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
              />

              {multiSelectMode && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5 bg-white/95 backdrop-blur-sm border border-light-300/60 rounded-2xl shadow-xl px-4 py-2.5">
                  <div className="flex items-center gap-2 pr-3 border-r border-light-300/60">
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse flex-shrink-0" />
                    <span className="text-xs font-semibold text-navy-900">Selección activa</span>
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums">{multiSelectedIds.size} seleccionado{multiSelectedIds.size !== 1 ? 's' : ''}</span>
                  <button
                    onClick={selectAllAvailable}
                    className="text-[11px] font-semibold text-accent hover:text-accent-light transition-colors px-2 py-1 rounded-lg hover:bg-accent/5"
                  >
                    Todos disponibles
                  </button>
                  {multiSelectedIds.size > 0 && (
                    <button
                      onClick={() => setShowBroadcast(true)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-accent px-3 py-1.5 rounded-xl hover:bg-accent-light transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                      Enviar audio
                    </button>
                  )}
                  <button
                    onClick={clearMultiSelect}
                    className="w-7 h-7 rounded-lg bg-light-200 flex items-center justify-center text-gray-400 hover:text-danger transition-all"
                    title="Salir de selección"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {panelDriverId && (
              <DriverPanel
                driver={drivers.find((driver) => driver.id === panelDriverId)}
                onClose={() => {
                  setPanelDriverId(null);
                  setSelectedId(null);
                }}
                onAssignTrip={handleAssignTrip}
                commissionPercent={commissionPercent}
              />
            )}
          </>
        )}
      </main>

      {tripModalDriver && (
        <TripAssignModal
          driver={tripModalDriver}
          onClose={() => setTripModalDriver(null)}
          onSuccess={handleTripSuccess}
          calculatePrice={calculatePrice}
          tariffPerKm={tariffPerKm}
          tariffBase={tariffBase}
          commissionPercent={commissionPercent}
        />
      )}

      {showBroadcast && multiSelectedDrivers.length > 0 && (
        <BroadcastVoiceChat
          drivers={multiSelectedDrivers}
          onClose={() => setShowBroadcast(false)}
        />
      )}
    </div>
  );
}

// ── Componentes de navegación ──────────────────────────────────────────────────

function NavTab({ children, icon, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 ${
        active
          ? 'bg-navy-900 text-white shadow-sm'
          : 'text-gray-500 hover:text-navy-900 hover:bg-light-200'
      }`}
    >
      {icon}
      <span>{children}</span>
      {badge != null && badge > 0 && (
        <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-warning text-white rounded-full px-1 -mr-0.5">
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
      className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${
        active
          ? 'bg-navy-900 text-white shadow-sm'
          : 'text-gray-400 hover:text-navy-900 hover:bg-light-200'
      }`}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold bg-violet-500 text-white rounded-full">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
