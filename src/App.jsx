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

  useEffect(() => {
    const timer = setInterval(() => refetch(), 30000);
    return () => clearInterval(timer);
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

  const actionButtons = [
    {
      key: 'management',
      title: 'Gestionar choferes',
      subtitle: currentView === 'management' ? 'Vista activa' : 'Alta, edición y control',
      active: currentView === 'management',
      accent: 'accent',
      onClick: () => setCurrentView(currentView === 'management' ? 'map' : 'management'),
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      key: 'selection',
      title: multiSelectMode ? 'Salir de selección' : 'Seleccionar choferes',
      subtitle: multiSelectMode ? `${multiSelectedIds.size} seleccionados` : 'Elegí varios manualmente',
      active: multiSelectMode,
      accent: 'violet',
      onClick: () => {
        if (multiSelectMode) {
          clearMultiSelect();
        } else {
          setMultiSelectMode(true);
          setPanelDriverId(null);
          setSelectedId(null);
        }
      },
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      ),
    },
    {
      key: 'broadcast',
      title: 'Audio masivo',
      subtitle: 'Voz a todos los disponibles',
      active: showBroadcast,
      accent: 'navy',
      onClick: () => {
        setMultiSelectMode(true);
        selectAllAvailable();
        setShowBroadcast(true);
        setPanelDriverId(null);
        setSelectedId(null);
      },
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="h-screen bg-dashboard-shell p-3 overflow-hidden">
      <div className="h-full flex flex-col gap-3">
        <div className="bg-light-50/92 backdrop-blur-xl border border-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] rounded-[24px] px-4 py-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Branding */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent-light rounded-xl flex items-center justify-center shadow-md shadow-accent/20 flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                </svg>
              </div>
              <h1 className="text-navy-900 font-bold text-sm leading-tight whitespace-nowrap">Profesional</h1>
            </div>

            {/* Stats */}
            <div className="flex-1 min-w-0">
              <StatsBar drivers={drivers} />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0 overflow-x-auto dashboard-toolbar">
              {actionButtons.map(({ key, ...action }) => (
                <ActionButton key={key} {...action} />
              ))}
            </div>

            {/* Clock */}
            <div className="flex items-center gap-2 flex-shrink-0 rounded-xl bg-light-100/90 border border-light-300/60 px-3 py-1.5">
              <div>
                <p className="text-navy-900 text-sm font-bold tabular-nums leading-none">{timeStr}</p>
                <p className="text-[10px] text-gray-500 capitalize truncate max-w-[110px] mt-0.5">{dateStr}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex overflow-hidden rounded-[24px] border border-white/70 bg-light-50/88 backdrop-blur-xl shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
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
                whatsappAmtFare={whatsappAmtFare}
                whatsappDriverCommission={whatsappDriverCommission}
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
        </div>

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
    </div>
  );
}

function ActionButton({ title, subtitle, icon, onClick, active = false, accent = 'slate' }) {
  const styles = {
    accent: active
      ? 'border-accent/30 bg-accent/10 text-accent shadow-[0_10px_24px_rgba(220,38,38,0.14)]'
      : 'border-light-300/60 bg-white/80 text-navy-800 hover:border-accent/30 hover:bg-accent/5',
    violet: active
      ? 'border-violet-500/30 bg-violet-500/10 text-violet-600 shadow-[0_10px_24px_rgba(139,92,246,0.12)]'
      : 'border-light-300/60 bg-white/80 text-navy-800 hover:border-violet-500/30 hover:bg-violet-500/5',
    navy: active
      ? 'border-navy-700/20 bg-navy-dim text-navy-700 shadow-[0_10px_24px_rgba(30,58,95,0.1)]'
      : 'border-light-300/60 bg-white/80 text-navy-800 hover:border-navy-700/20 hover:bg-navy-dim',
    slate: 'border-light-300/60 bg-white/80 text-navy-800 hover:border-navy-700/20 hover:bg-light-100',
  };

  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-all duration-200 shadow-[0_4px_12px_rgba(15,23,42,0.04)] whitespace-nowrap ${styles[accent]}`}
    >
      <div className="w-6 h-6 rounded-lg bg-light-100/95 border border-white/70 flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold leading-tight">{title}</p>
        <p className="text-[10px] text-gray-500 leading-tight truncate max-w-[140px]">{subtitle}</p>
      </div>
    </button>
  );
}
