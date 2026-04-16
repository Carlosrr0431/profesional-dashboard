import { useState, useRef, useCallback, useEffect } from 'react';
import { useDrivers } from './hooks/useDrivers';
import { useSettings } from './hooks/useSettings';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import DriverPanel from './components/DriverPanel';
import TripAssignModal from './components/TripAssignModal';
import DriverManagement from './components/DriverManagement';
import BroadcastVoiceChat from './components/BroadcastVoiceChat';

export default function App() {
  const { drivers, loading, refetch } = useDrivers();
  const { tariffPerKm, tariffBase, commissionPercent, calculatePrice, updateSetting } = useSettings();
  const [selectedId, setSelectedId] = useState(null);
  const [panelDriverId, setPanelDriverId] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [tripModalDriver, setTripModalDriver] = useState(null);
  const [currentView, setCurrentView] = useState('map');
  const mapRef = useRef(null);

  // Multi-select state
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
      .filter((d) => d.isOnline && !d.activeTrip)
      .map((d) => d.id);
    setMultiSelectedIds(new Set(availableIds));
  }, [drivers]);

  const clearMultiSelect = useCallback(() => {
    setMultiSelectedIds(new Set());
    setMultiSelectMode(false);
    setShowBroadcast(false);
  }, []);

  const multiSelectedDrivers = drivers.filter((d) => multiSelectedIds.has(d.id));

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-refetch every 30s as fallback for missed realtime events
  useEffect(() => {
    const t = setInterval(() => refetch(), 30000);
    return () => clearInterval(t);
  }, [refetch]);

  const handleCenterDriver = useCallback((driver) => {
    if (mapRef.current && driver.lat && driver.lng) {
      mapRef.current.panTo({ lat: driver.lat, lng: driver.lng });
      mapRef.current.setZoom(16);
    }
  }, []);

  const handleCenterAll = useCallback(() => {
    if (!mapRef.current || drivers.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    drivers.forEach((d) => {
      if (d.lat && d.lng) bounds.extend({ lat: d.lat, lng: d.lng });
    });
    mapRef.current.fitBounds(bounds, 60);
  }, [drivers]);

  const handleAssignTrip = useCallback((driver) => {
    setTripModalDriver(driver);
  }, []);

  const handleTripSuccess = useCallback((trip) => {
    setTripModalDriver(null);
    // Could show a toast/notification here
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-light-200">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm font-medium">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  const timeStr = clock.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = clock.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-light-50 border-b border-light-300/50 px-4 py-2.5 flex items-center gap-5">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 bg-gradient-to-br from-accent to-accent-light rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-navy-900 font-bold text-sm leading-tight">Profesional App</h1>
            <p className="text-gray-500 text-[10px]">Panel de control</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1">
          <StatsBar drivers={drivers} />
        </div>

        {/* Clock & actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-navy-900 text-sm font-semibold tabular-nums">{timeStr}</p>
            <p className="text-gray-500 text-[10px] capitalize">{dateStr}</p>
          </div>
          <button
            onClick={() => setCurrentView(currentView === 'management' ? 'map' : 'management')}
            title="Gestión de choferes"
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
              currentView === 'management'
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'bg-light-200 border-light-300/50 text-gray-400 hover:text-accent hover:border-accent/30'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (multiSelectMode) {
                clearMultiSelect();
              } else {
                setMultiSelectMode(true);
                setPanelDriverId(null);
                setSelectedId(null);
              }
            }}
            title="Seleccionar choferes para audio grupal"
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
              multiSelectMode
                ? 'bg-violet-500/15 border-violet-500/30 text-violet-500'
                : 'bg-light-200 border-light-300/50 text-gray-400 hover:text-violet-500 hover:border-violet-500/30'
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
          </button>
          <button
            onClick={() => {
              setMultiSelectMode(true);
              selectAllAvailable();
              setShowBroadcast(true);
              setPanelDriverId(null);
              setSelectedId(null);
            }}
            title="Enviar audio a todos los disponibles"
            className="w-9 h-9 rounded-xl bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </button>
          <button
            onClick={handleCenterAll}
            title="Centrar todos los choferes"
            className="w-9 h-9 rounded-xl bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button
            onClick={refetch}
            title="Refrescar datos"
            className="w-9 h-9 rounded-xl bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {currentView === 'management' ? (
          <DriverManagement onBack={() => setCurrentView('map')} />
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
              onUpdateSetting={updateSetting}
            />
            <div className="flex-1 relative">
              <MapView
                drivers={drivers}
                selectedId={selectedId}
                onSelectDriver={setSelectedId}
                mapRef={mapRef}
                onAssignTrip={handleAssignTrip}
                multiSelectMode={multiSelectMode}
                multiSelectedIds={multiSelectedIds}
                onToggleMultiSelect={toggleMultiSelect}
              />

              {/* Multi-select floating controls */}
              {multiSelectMode && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-light-50/95 backdrop-blur border border-light-300/50 rounded-2xl shadow-xl px-4 py-2.5">
                  <div className="flex items-center gap-2 pr-3 border-r border-light-300/50">
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                    <span className="text-xs font-semibold text-navy-900">Modo selección</span>
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums">{multiSelectedIds.size} seleccionado{multiSelectedIds.size !== 1 ? 's' : ''}</span>
                  <button
                    onClick={selectAllAvailable}
                    className="text-[11px] font-semibold text-accent hover:text-accent-light transition-colors px-2 py-1 rounded-lg hover:bg-accent/10"
                  >
                    Todos disponibles
                  </button>
                  {multiSelectedIds.size > 0 && (
                    <button
                      onClick={() => setShowBroadcast(true)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-gradient-to-r from-accent to-accent-light px-3 py-1.5 rounded-xl hover:shadow-lg hover:shadow-accent/20 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                      Enviar audio
                    </button>
                  )}
                  <button
                    onClick={clearMultiSelect}
                    className="w-7 h-7 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-danger hover:border-danger/30 transition-all"
                    title="Salir de selección"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
            </div>
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
      </div>

      {/* Trip Assignment Modal */}
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

      {/* Broadcast Voice Chat */}
      {showBroadcast && multiSelectedDrivers.length > 0 && (
        <BroadcastVoiceChat
          drivers={multiSelectedDrivers}
          onClose={() => setShowBroadcast(false)}
        />
      )}
    </div>
  );
}
