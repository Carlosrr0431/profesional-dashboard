import { useState, useRef, useCallback } from 'react';
import { useDrivers } from './hooks/useDrivers';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';

export default function App() {
  const { drivers, loading } = useDrivers();
  const [selectedId, setSelectedId] = useState(null);
  const mapRef = useRef(null);

  const handleCenterDriver = useCallback((driver) => {
    if (mapRef.current && driver.lat && driver.lng) {
      mapRef.current.panTo({ lat: driver.lat, lng: driver.lng });
      mapRef.current.setZoom(16);
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top stats bar */}
      <div className="bg-dark-800 border-b border-dark-600 px-4 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-white font-bold text-base">Remises Dashboard</h1>
        </div>
        <div className="flex-1">
          <StatsBar drivers={drivers} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          drivers={drivers}
          selectedId={selectedId}
          onSelectDriver={setSelectedId}
          onCenterDriver={handleCenterDriver}
        />
        <div className="flex-1">
          <MapView
            drivers={drivers}
            selectedId={selectedId}
            onSelectDriver={setSelectedId}
            mapRef={mapRef}
          />
        </div>
      </div>
    </div>
  );
}
