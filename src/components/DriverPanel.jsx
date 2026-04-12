import { useState } from 'react';
import { useDriverTrips } from '../hooks/useTrips';
import { formatPrice, formatKm, formatDuration, formatTime, formatDateTime, getTripStatus } from '../lib/utils';

export default function DriverPanel({ driver, onClose, onAssignTrip }) {
  const { trips, loading, stats } = useDriverTrips(driver?.id);
  const [tab, setTab] = useState('today');

  if (!driver) return null;

  const initials = driver.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Determine driver activity status
  const getDriverStatus = () => {
    if (stats.inProgress) {
      const s = stats.inProgress.status;
      if (s === 'in_progress') return { label: 'En viaje', color: 'text-online', bg: 'bg-online/15', dot: 'bg-online' };
      if (s === 'going_to_pickup') return { label: 'Buscando pasajero', color: 'text-accent-light', bg: 'bg-accent/15', dot: 'bg-accent' };
      if (s === 'accepted') return { label: 'Viaje aceptado', color: 'text-accent', bg: 'bg-accent/15', dot: 'bg-accent' };
    }
    if (driver.isOnline) return { label: 'Disponible', color: 'text-online', bg: 'bg-online/15', dot: 'bg-online' };
    return { label: 'Desconectado', color: 'text-offline', bg: 'bg-offline/15', dot: 'bg-offline' };
  };

  const driverStatus = getDriverStatus();

  // Filter trips by tab
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const filteredTrips = tab === 'today'
    ? trips.filter((t) => new Date(t.created_at) >= todayStart)
    : trips;

  return (
    <div className="w-96 bg-dark-800 border-l border-dark-600/50 flex flex-col h-full animate-slideIn">
      {/* Header */}
      <div className="p-4 border-b border-dark-600/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Detalle del chofer</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-dark-700 border border-dark-600/50 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Driver info card */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold ${
            driver.isOnline ? 'bg-online-dim text-online' : 'bg-dark-600/50 text-gray-400'
          }`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-white truncate">{driver.fullName}</p>
              {driver.driverNumber && (
                <span className="text-[10px] font-bold text-accent bg-accent/15 px-1.5 py-0.5 rounded-md">#{driver.driverNumber}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                driver.vehicleType === 'moto'
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-accent/15 text-accent-light'
              }`}>
                {driver.vehicleType === 'moto' ? '🏍️' : '🚗'}
                {driver.vehicleType === 'moto' ? 'Moto' : 'Auto'}
              </span>
              <p className="text-xs text-gray-400 truncate">
                {driver.vehicleBrand} {driver.vehicleModel} · {driver.vehiclePlate}
              </p>
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center justify-between">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${driverStatus.bg} ${driverStatus.color}`}>
            <span className={`w-2 h-2 rounded-full ${driverStatus.dot}`} />
            {driverStatus.label}
          </div>
          {driver.isOnline && !stats.inProgress ? (
            <button
              onClick={() => onAssignTrip(driver)}
              className="text-xs font-medium text-accent hover:text-accent-light transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Asignar viaje
            </button>
          ) : (
            <span className="text-[10px] text-gray-500">
              {stats.inProgress ? 'En viaje activo' : 'No disponible'}
            </span>
          )}
        </div>
      </div>

      {/* Active trip banner */}
      {stats.inProgress && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-accent/10 border border-accent/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            <span className="text-xs font-semibold text-accent">Viaje activo</span>
          </div>
          <p className="text-xs text-gray-300 truncate">{stats.inProgress.passenger_name}</p>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">
            → {stats.inProgress.destination_address}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
            <span>{formatPrice(stats.inProgress.price)}</span>
            <span>·</span>
            <span>{formatKm(stats.inProgress.distance_km)}</span>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="p-4">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Estadísticas de hoy</p>
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="Viajes" value={stats.todayTrips} icon="🚗" />
          <StatBox label="Ingresos" value={formatPrice(stats.todayEarnings)} icon="💰" />
          <StatBox label="Kilómetros" value={formatKm(stats.todayKm)} icon="📍" />
          <StatBox label="Completados" value={stats.completed} icon="✅" sub={`de ${stats.total}`} />
        </div>

        {/* All-time summary row */}
        <div className="flex gap-2 mt-2">
          <div className="flex-1 bg-dark-700/50 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500">Total ganado</p>
            <p className="text-sm font-bold text-green-400">{formatPrice(stats.totalEarnings)}</p>
          </div>
          <div className="flex-1 bg-dark-700/50 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500">Total km</p>
            <p className="text-sm font-bold text-accent">{formatKm(stats.totalKm)}</p>
          </div>
          <div className="flex-1 bg-dark-700/50 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500">Cancelados</p>
            <p className="text-sm font-bold text-danger">{stats.cancelled}</p>
          </div>
        </div>
      </div>

      {/* Trips tabs */}
      <div className="px-4 flex gap-1 bg-dark-700/30 mx-4 rounded-lg p-1">
        {[
          { key: 'today', label: 'Hoy' },
          { key: 'all', label: 'Historial' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
              tab === t.key
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Trip list */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-dark-700/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">Sin viajes</p>
            <p className="text-gray-600 text-xs mt-1">
              {tab === 'today' ? 'No hay viajes registrados hoy' : 'No hay historial de viajes'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTrips.map((trip) => (
              <TripRow key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, sub }) {
  return (
    <div className="bg-dark-700/50 border border-dark-600/30 rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-xs">{icon}</span>
      </div>
      <p className="text-sm font-bold text-white">
        {value}
        {sub && <span className="text-[10px] font-normal text-gray-500 ml-1">{sub}</span>}
      </p>
    </div>
  );
}

function TripRow({ trip }) {
  const status = getTripStatus(trip.status);

  return (
    <div className="bg-dark-700/40 border border-dark-600/30 rounded-xl p-3 hover:bg-dark-700/60 transition-colors">
      {/* Top: passenger + status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-xs font-medium text-white truncate">{trip.passenger_name}</span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Route */}
      <div className="space-y-1 mb-2">
        <div className="flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-online mt-1.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-300 truncate">{trip.origin_address}</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-300 truncate">{trip.destination_address}</p>
        </div>
      </div>

      {/* Bottom: price, km, time */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span className="font-semibold text-green-400">{formatPrice(trip.price)}</span>
        <span>·</span>
        <span>{formatKm(trip.distance_km)}</span>
        <span>·</span>
        <span>{formatDuration(trip.duration_minutes)}</span>
        <span className="ml-auto">{formatTime(trip.created_at)}</span>
      </div>
    </div>
  );
}
