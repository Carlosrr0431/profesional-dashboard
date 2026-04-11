import { useState } from 'react';
import { timeAgo } from '../lib/utils';

export default function Sidebar({ drivers, selectedId, onSelectDriver, onCenterDriver }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | online | offline

  const filtered = drivers.filter((d) => {
    if (filter === 'online' && !d.isOnline) return false;
    if (filter === 'offline' && d.isOnline) return false;
    if (search && !d.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="w-80 bg-dark-800 border-r border-dark-600 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-dark-600">
        <h2 className="text-lg font-bold text-white mb-3">Choferes</h2>

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
            className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-dark-700 rounded-lg p-1">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'online', label: 'Online' },
            { key: 'offline', label: 'Offline' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                filter === f.key
                  ? 'bg-accent text-white'
                  : 'text-gray-400 hover:text-white'
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
          <div className="p-8 text-center text-gray-500 text-sm">
            No se encontraron choferes
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
      <div className="p-3 border-t border-dark-600 text-center">
        <p className="text-xs text-gray-500">
          {filtered.length} chofer{filtered.length !== 1 ? 'es' : ''}
        </p>
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
      className={`w-full text-left px-4 py-3 border-b border-dark-600/50 flex items-center gap-3 transition-colors hover:bg-dark-700 ${
        isSelected ? 'bg-dark-700 border-l-2 border-l-accent' : ''
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center text-sm font-bold text-accent">
          {initials}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-800 ${
            driver.isOnline ? 'bg-online' : 'bg-offline'
          }`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{driver.fullName}</p>
        <p className="text-xs text-gray-400 truncate">
          {driver.vehicleBrand} {driver.vehicleModel} · {driver.vehiclePlate}
        </p>
      </div>

      {/* Time */}
      <div className="text-right flex-shrink-0">
        <p className={`text-xs font-medium ${driver.isOnline ? 'text-online' : 'text-gray-500'}`}>
          {driver.isOnline ? 'Online' : 'Offline'}
        </p>
        <p className="text-[10px] text-gray-500">{timeAgo(driver.updatedAt)}</p>
      </div>
    </button>
  );
}
