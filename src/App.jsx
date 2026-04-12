import { useState, useRef, useCallback, useEffect } from 'react';
import { useDrivers } from './hooks/useDrivers';
import { useSettings } from './hooks/useSettings';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import DriverPanel from './components/DriverPanel';
import TripAssignModal from './components/TripAssignModal';

export default function App() {
  const { drivers, loading, refetch } = useDrivers();
  const { tariffPerKm, tariffBase, commissionPercent, calculatePrice, updateSetting } = useSettings();
  const [selectedId, setSelectedId] = useState(null);
  const [panelDriverId, setPanelDriverId] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [tripModalDriver, setTripModalDriver] = useState(null);
  const mapRef = useRef(null);

  // Remove Google Maps billing warning dialog that blocks clicks
  useEffect(() => {
    const interval = setInterval(() => {
      const dialogs = document.querySelectorAll('.dismissButton');
      dialogs.forEach((btn) => {
        const modal = btn.closest('div[style]');
        if (modal) modal.remove();
        else btn.click();
      });
      // Also target the white "can't load" dialog
      document.querySelectorAll('div[style*="background-color: white"]').forEach((el) => {
        if (el.textContent?.includes("can't load Google Maps") || el.textContent?.includes('Do you own')) {
          const parent = el.closest('div[style*="z-index"]') || el.parentElement;
          if (parent && !parent.classList.contains('pac-container')) parent.remove();
        }
      });
    }, 500);
    // Stop checking after 10s
    const timeout = setTimeout(() => clearInterval(interval), 10000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, []);

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
        <div className="flex-1">
          <MapView
            drivers={drivers}
            selectedId={selectedId}
            onSelectDriver={setSelectedId}
            mapRef={mapRef}
            onAssignTrip={handleAssignTrip}
          />
        </div>
        {panelDriverId && (
          <DriverPanel
            driver={drivers.find((d) => d.id === panelDriverId)}
            onClose={() => { setPanelDriverId(null); setSelectedId(null); }}
            onAssignTrip={handleAssignTrip}
            commissionPercent={commissionPercent}
          />
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
    </div>
  );
}
