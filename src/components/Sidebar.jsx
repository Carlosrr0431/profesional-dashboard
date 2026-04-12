import { useState } from 'react';
import { timeAgo, formatSpeed, getTripStatus } from '../lib/utils';

export default function Sidebar({ drivers, selectedId, onSelectDriver, onCenterDriver, tariffPerKm, tariffBase, onUpdateSetting }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showTariff, setShowTariff] = useState(false);

  const inTripCount = drivers.filter((d) => d.activeTrip).length;
  const onlineCount = drivers.filter((d) => d.isOnline && !d.activeTrip).length;
  const offlineCount = drivers.filter((d) => !d.isOnline).length;

  const filtered = drivers.filter((d) => {
    if (filter === 'available' && (!d.isOnline || d.activeTrip)) return false;
    if (filter === 'intrip' && !d.activeTrip) return false;
    if (filter === 'offline' && d.isOnline) return false;
    if (search && !d.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="w-80 bg-dark-800 border-r border-dark-600/50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-dark-600/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white">Choferes</h2>
          <span className="text-xs text-gray-500">{drivers.length} total</span>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar chofer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-dark-700 border border-dark-600/50 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-dark-700/60 rounded-xl p-1">
          {[
            { key: 'all', label: `Todos (${drivers.length})` },
            { key: 'available', label: `Libre (${onlineCount})` },
            { key: 'intrip', label: `En viaje (${inTripCount})` },
            { key: 'offline', label: `Offline (${offlineCount})` },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 text-[11px] font-medium py-2 rounded-lg transition-all ${
                filter === f.key
                  ? 'bg-accent text-white shadow-md shadow-accent/20'
                  : 'text-gray-400 hover:text-white hover:bg-dark-600/30'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Driver list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-dark-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-500 text-sm">No se encontraron choferes</p>
          </div>
        ) : (
          filtered.map((driver) => (
            <DriverRow
              key={driver.id}
              driver={driver}
              isSelected={selectedId === driver.id}
              onClick={() => {
                onSelectDriver(driver.id);
                onCenterDriver(driver);
              }}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-dark-600/50">
        {/* Tariff config toggle */}
        <button
          onClick={() => setShowTariff(!showTariff)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs hover:bg-dark-700/50 transition-all"
        >
          <div className="flex items-center gap-2 text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold">Tarifa: ${tariffPerKm}/km</span>
            {tariffBase > 0 && <span className="text-gray-500">+ ${tariffBase} base</span>}
          </div>
          <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showTariff ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showTariff && (
          <div className="px-4 pb-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-semibold block mb-1">$/KM</label>
                <input
                  type="number"
                  value={tariffPerKm}
                  onChange={(e) => onUpdateSetting('tariff_per_km', e.target.value)}
                  min="0"
                  step="50"
                  className="w-full bg-dark-700 border border-dark-600/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-semibold block mb-1">BASE ($)</label>
                <input
                  type="number"
                  value={tariffBase}
                  onChange={(e) => onUpdateSetting('tariff_base', e.target.value)}
                  min="0"
                  step="50"
                  className="w-full bg-dark-700 border border-dark-600/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-500">
              Ej: 5km = ${tariffBase > 0 ? `${tariffBase} + ` : ''}{tariffPerKm} × 5 = <span className="text-accent font-semibold">${Math.round(tariffBase + tariffPerKm * 5).toLocaleString('es-AR')}</span>
            </p>
          </div>
        )}

        <div className="px-3 py-2 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {filtered.length} chofer{filtered.length !== 1 ? 'es' : ''}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-online opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-online" />
            </span>
            Tiempo real
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverRow({ driver, isSelected, onClick }) {
  const initials = driver.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all border-l-2 ${
        isSelected
          ? 'bg-accent-dim border-l-accent'
          : 'border-l-transparent hover:bg-dark-700/50'
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
          driver.isOnline ? 'bg-online-dim text-online' : 'bg-dark-600/50 text-gray-400'
        }`}>
          {initials}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-dark-800 flex items-center justify-center ${
            driver.isOnline ? 'bg-online' : 'bg-offline'
          }`}
        >
          {driver.isOnline && (
            driver.vehicleType === 'moto' ? (
              <svg className="w-2 h-2 text-dark-900" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.65-1.97-4.77-4.56-4.97zM7.82 15C7.4 16.15 6.28 17 5 17c-1.63 0-3-1.37-3-3s1.37-3 3-3c1.28 0 2.4.85 2.82 2H5v2h2.82zM19 17c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
              </svg>
            ) : (
              <svg className="w-2 h-2 text-dark-900" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z" />
              </svg>
            )
          )}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-white truncate">{driver.fullName}</p>
          {driver.driverNumber && (
            <span className="text-[10px] font-bold text-accent bg-accent/15 px-1.5 py-0.5 rounded-md">#{driver.driverNumber}</span>
          )}
        </div>
        <p className="text-xs text-gray-400 truncate">
          <span className="text-[10px]">{driver.vehicleType === 'moto' ? '🏍️' : '🚗'}</span>{' '}
          {driver.vehicleBrand} {driver.vehicleModel} · <span className="font-medium text-gray-300">{driver.vehiclePlate}</span>
        </p>
        {driver.isOnline && driver.speed > 0.5 && (
          <p className="text-[10px] text-accent mt-0.5">
            {formatSpeed(driver.speed)} →
          </p>
        )}
      </div>

      {/* Status & time */}
      <div className="text-right flex-shrink-0">
        {driver.activeTrip ? (
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${getTripStatus(driver.activeTrip.status).bg} ${getTripStatus(driver.activeTrip.status).color}`}>
            {getTripStatus(driver.activeTrip.status).label}
          </span>
        ) : (
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            driver.isOnline
              ? 'bg-online/15 text-online'
              : 'bg-dark-600/50 text-gray-500'
          }`}>
            {driver.isOnline ? 'Disponible' : 'Offline'}
          </span>
        )}
        <p className="text-[10px] text-gray-500 mt-1">{timeAgo(driver.updatedAt)}</p>
      </div>
    </button>
  );
}
