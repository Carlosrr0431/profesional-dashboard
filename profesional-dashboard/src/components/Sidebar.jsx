import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { timeAgo, formatSpeed, getTripStatus } from '../lib/utils';

export default function Sidebar({ drivers, selectedId, onSelectDriver, onCenterDriver, tariffPerKm, tariffBase, commissionPercent, passengerAppTariffPerKm, passengerAppTariffBase, passengerAppCommissionPercent, onUpdateSetting }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showTariff, setShowTariff] = useState(false);
  const [availability, setAvailability] = useState({});
  const channelRef = useRef(null);

  useEffect(() => {
    async function fetchAvailability() {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, is_available, updated_at');

      if (error) {
        console.error('[Sidebar] error al cargar disponibilidad:', error.message);
        return;
      }

      const map = {};
      (data || []).forEach((row) => {
        map[row.id] = {
          isAvailable: Boolean(row.is_available),
          updatedAt: row.updated_at,
        };
      });
      setAvailability(map);
    }

    fetchAvailability();

    channelRef.current = supabase
      .channel('sidebar_drivers_availability')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          setAvailability((prev) => ({
            ...prev,
            [row.id]: {
              isAvailable: Boolean(row.is_available),
              updatedAt: row.updated_at || prev[row.id]?.updatedAt,
            },
          }));
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  const driversLive = useMemo(
    () =>
      drivers.map((driver) => {
        const live = availability[driver.id];
        const isOnline = live ? live.isAvailable : Boolean(driver.isAvailable);
        return {
          ...driver,
          isOnline,
          updatedAt: live?.updatedAt || driver.updatedAt,
        };
      }),
    [drivers, availability]
  );

  const inTripCount = driversLive.filter((d) => d.activeTrip).length;
  const onlineCount = driversLive.filter((d) => d.isOnline && !d.activeTrip).length;
  const offlineCount = driversLive.filter((d) => !d.isOnline).length;

  const filtered = driversLive.filter((d) => {
    if (filter === 'available' && (!d.isOnline || d.activeTrip)) return false;
    if (filter === 'intrip' && !d.activeTrip) return false;
    if (filter === 'offline' && d.isOnline) return false;
    if (search && !d.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="w-[340px] bg-gradient-to-b from-white to-light-100/40 border-r border-light-300/40 flex flex-col h-full shadow-[4px_0_24px_rgba(15,23,42,0.04)]">
      {/* Header compacto */}
      <div className="px-3 pt-2 pb-2 border-b border-light-300/40 shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="text-sm font-bold text-navy-900 tracking-tight">Flota activa</h2>
          <span className="text-[10px] text-gray-400 tabular-nums">{driversLive.length}</span>
          <span className="relative flex h-1.5 w-1.5 ml-auto">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-50" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
        </div>

        <div className="relative mb-1.5">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar chofer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-light-200/50 border border-light-300/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-navy-900 placeholder-gray-400 focus:outline-none focus:border-navy-700/20 focus:bg-white transition-all"
          />
        </div>

        <div className="flex gap-0.5">
          {[
            { key: 'all', label: 'Todos', count: driversLive.length },
            { key: 'available', label: 'Libres', count: onlineCount },
            { key: 'intrip', label: 'Viaje', count: inTripCount },
            { key: 'offline', label: 'Off', count: offlineCount },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 min-w-0 text-[10px] font-semibold px-1 py-1 rounded-md transition-all ${
                filter === f.key
                  ? 'bg-navy-900 text-white'
                  : 'text-gray-500 hover:text-navy-800 hover:bg-light-200/80'
              }`}
            >
              {f.label}
              <span className={`ml-0.5 tabular-nums ${filter === f.key ? 'text-white/70' : 'text-gray-400'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Driver list */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1.5 min-h-0">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-light-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <div className="border-t border-light-300/50">
        {/* Tariff config toggle */}
        <button
          onClick={() => setShowTariff(!showTariff)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs hover:bg-light-200/80 transition-all"
        >
          <div className="flex items-center gap-2 text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold">${tariffPerKm}/km · Comisión {commissionPercent}%</span>
          </div>
          <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showTariff ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showTariff && (
          <div className="px-4 pb-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 mb-1">Viaje por plataforma</p>
            <p className="text-[10px] text-gray-400 mb-2">Precio de plataforma activo para todos los viajes operativos.</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-semibold block mb-1">$/KM</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(tariffPerKm)}
                  onChange={(e) => onUpdateSetting('platform_tariff_per_km', e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-light-200 border border-light-300/50 rounded-lg px-3 py-1.5 text-sm text-navy-900 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-semibold block mb-1">BASE ($)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(tariffBase)}
                  onChange={(e) => onUpdateSetting('platform_tariff_base', e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-light-200 border border-light-300/50 rounded-lg px-3 py-1.5 text-sm text-navy-900 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-semibold block mb-1">COMISIÓN %</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(commissionPercent)}
                  onChange={(e) => onUpdateSetting('platform_commission_percent', e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-light-200 border border-light-300/50 rounded-lg px-3 py-1.5 text-sm text-navy-900 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-500">
              Ej: 5km = {tariffBase > 0 ? `${tariffBase} + ` : ''}{tariffPerKm} × 5 = <span className="text-accent font-semibold">${Math.round(tariffBase + tariffPerKm * 5).toLocaleString('es-AR')}</span>
              {' · '}Comisión: <span className="text-amber-400 font-semibold">${Math.round((tariffBase + tariffPerKm * 5) * commissionPercent / 100).toLocaleString('es-AR')}</span>
            </p>
            <div className="pt-2 border-t border-light-300/50">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 mb-1">Viajes por aplicación pasajeros</p>
              <p className="text-[10px] text-gray-400 mb-2">Tarifas activas para viajes solicitados desde la app de pasajeros.</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 font-semibold block mb-1">$/KM</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(passengerAppTariffPerKm)}
                    onChange={(e) => onUpdateSetting('passenger_app_tariff_per_km', e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-light-200 border border-light-300/50 rounded-lg px-3 py-1.5 text-sm text-navy-900 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 font-semibold block mb-1">BASE ($)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(passengerAppTariffBase)}
                    onChange={(e) => onUpdateSetting('passenger_app_tariff_base', e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-light-200 border border-light-300/50 rounded-lg px-3 py-1.5 text-sm text-navy-900 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 font-semibold block mb-1">COMISIÓN %</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(passengerAppCommissionPercent)}
                    onChange={(e) => onUpdateSetting('passenger_app_commission_percent', e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-light-200 border border-light-300/50 rounded-lg px-3 py-1.5 text-sm text-navy-900 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                Ej: 5km = {passengerAppTariffBase > 0 ? `${passengerAppTariffBase} + ` : ''}{passengerAppTariffPerKm} × 5 = <span className="text-accent font-semibold">${Math.round(passengerAppTariffBase + passengerAppTariffPerKm * 5).toLocaleString('es-AR')}</span>
                {' · '}Comisión: <span className="text-amber-400 font-semibold">${Math.round((passengerAppTariffBase + passengerAppTariffPerKm * 5) * passengerAppCommissionPercent / 100).toLocaleString('es-AR')}</span>
              </p>
            </div>
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

  const tripStatus = driver.activeTrip ? getTripStatus(driver.activeTrip.status) : null;

  const statusTone = tripStatus
    ? `${tripStatus.bg} ${tripStatus.color} border-transparent`
    : driver.isOnline
      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/15'
      : 'bg-light-200 text-gray-500 border-light-300/60';

  const statusLabel = tripStatus
    ? tripStatus.label
    : (driver.isOnline ? 'Disponible' : 'Offline');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-2.5 flex items-center gap-2.5 transition-all duration-200 ${
        isSelected
          ? 'bg-white border-accent/25 shadow-md shadow-accent/10 ring-1 ring-accent/10'
          : 'bg-white/70 border-light-300/40 hover:bg-white hover:border-light-300/80'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
          driver.isOnline ? 'bg-light-200 text-navy-800' : 'bg-light-200/60 text-gray-400'
        }`}>
          {initials}
        </div>
        {driver.driverNumber != null && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-md bg-navy-900 text-white text-[9px] font-bold flex items-center justify-center border border-white">
            {driver.driverNumber}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-semibold text-navy-900 truncate">{driver.fullName}</p>
          {driver.commissionOverdue && (
            <span className="text-[9px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md shrink-0">⚠</span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {driver.vehicleBrand} {driver.vehicleModel}
          <span className="text-gray-300 mx-1">·</span>
          <span className="font-semibold text-gray-400">{driver.vehiclePlate}</span>
        </p>
        {driver.isOnline && driver.speed > 0.5 && (
          <p className="text-[10px] text-accent font-medium mt-1">{formatSpeed(driver.speed)} en movimiento</p>
        )}
      </div>

      {/* Status */}
      <div className="text-right flex-shrink-0">
        <span className={`inline-block text-[9px] font-semibold px-2 py-0.5 rounded-full border ${statusTone}`}>
          {statusLabel}
        </span>
        <p className="text-[9px] text-gray-400 mt-1">{timeAgo(driver.updatedAt)}</p>
      </div>
    </button>
  );
}
