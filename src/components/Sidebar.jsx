import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { timeAgo, formatSpeed, getTripStatus } from '../lib/utils';
import { matchesDriverSearch } from '../lib/driverRoles';
import { resolveDriverIsOnline } from '../lib/driverPresence';
import DriverAvatar from './DriverAvatar';

export default function Sidebar({
  drivers,
  selectedId,
  onSelectDriver,
  onCenterDriver,
  tariffPerKm,
  tariffBase,
  commissionPercent,
  passengerAppTariffPerKm,
  passengerAppTariffBase,
  passengerAppCommissionPercent,
  onUpdateSetting,
  onClose,
}) {
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
          if (payload.eventType === 'DELETE') {
            const removedId = payload.old?.id;
            if (!removedId) return;
            setAvailability((prev) => {
              if (!(removedId in prev)) return prev;
              const next = { ...prev };
              delete next[removedId];
              return next;
            });
            return;
          }

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
        const flaggedAvailable = live ? live.isAvailable : Boolean(driver.isAvailable);
        // No pisar el timestamp de GPS con drivers.updated_at (puede quedar viejo días).
        const gpsTs = driver.updatedAt ? new Date(driver.updatedAt).getTime() : 0;
        const availTs = live?.updatedAt ? new Date(live.updatedAt).getTime() : 0;
        const updatedAt = gpsTs >= availTs
          ? (driver.updatedAt || live?.updatedAt)
          : (live?.updatedAt || driver.updatedAt);
        const isOnline = resolveDriverIsOnline({
          isAvailable: flaggedAvailable,
          lat: driver.lat,
          lng: driver.lng,
          updatedAt,
          gpsSimulationActive: driver.gpsSimulationActive,
        });
        return {
          ...driver,
          isOnline,
          updatedAt,
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
    if (search && !matchesDriverSearch(d, search)) return false;
    return true;
  });

  return (
    <div className="flex h-full w-full flex-col bg-white lg:w-[340px] lg:max-w-[340px]">
      {/* Header compacto */}
      <div className="shrink-0 border-b border-slate-100 px-3.5 pb-3 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">Flota activa</h2>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold tabular-nums text-slate-500">{driversLive.length}</span>
          <span className="relative ml-auto flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
              aria-label="Cerrar flota"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="relative mb-2">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar nombre o móvil…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200/60 bg-slate-50 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 transition-all focus:border-accent/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
        </div>

        <div className="flex gap-0.5 overflow-x-auto pb-0.5 scrollbar-none">
          {[
            { key: 'all', label: 'Todos', count: driversLive.length },
            { key: 'available', label: 'Libres', count: onlineCount },
            { key: 'intrip', label: 'Viaje', count: inTripCount },
            { key: 'offline', label: 'Off', count: offlineCount },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 text-[10px] font-semibold px-1.5 py-1.5 rounded-xl transition-all whitespace-nowrap text-center ${
                filter === f.key
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {f.label}
              <span className={`ml-0.5 tabular-nums ${filter === f.key ? 'text-white/65' : 'text-slate-400'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Driver list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 min-h-0">
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
      <div className="border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowTariff((open) => !open)}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-slate-50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold tracking-tight text-navy-900">Tarifas</span>
            <span className="block truncate text-[10px] font-medium text-slate-500">
              ${tariffPerKm}/km · comisión {commissionPercent}%
            </span>
          </span>
          <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${showTariff ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showTariff ? (
          <div className="space-y-2.5 px-3 pb-3">
            <TariffPlanCard
              title="Plataforma"
              description="WhatsApp y panel. Vale para los viajes operativos."
              tone="navy"
              perKm={tariffPerKm}
              base={tariffBase}
              commission={commissionPercent}
              onPerKm={(v) => onUpdateSetting('platform_tariff_per_km', v)}
              onBase={(v) => onUpdateSetting('platform_tariff_base', v)}
              onCommission={(v) => onUpdateSetting('platform_commission_percent', v)}
            />
            <TariffPlanCard
              title="App pasajeros"
              description="Solo viajes pedidos desde la app."
              tone="accent"
              perKm={passengerAppTariffPerKm}
              base={passengerAppTariffBase}
              commission={passengerAppCommissionPercent}
              onPerKm={(v) => onUpdateSetting('passenger_app_tariff_per_km', v)}
              onBase={(v) => onUpdateSetting('passenger_app_tariff_base', v)}
              onCommission={(v) => onUpdateSetting('passenger_app_commission_percent', v)}
            />
          </div>
        ) : null}

        <div className="px-3.5 py-2 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">
            {filtered.length} chofer{filtered.length !== 1 ? 'es' : ''}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
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

function moneyAr(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;
}

function TariffField({ label, prefix, value, onChange }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="relative block">
        {prefix ? (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400">
            {prefix}
          </span>
        ) : null}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={String(value)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          className={`h-9 w-full rounded-xl border border-slate-200 bg-slate-50 text-center text-[13px] font-bold tabular-nums text-navy-900 outline-none transition focus:border-navy-900/35 focus:bg-white focus:ring-2 focus:ring-navy-900/10 ${prefix ? 'pl-5 pr-2' : 'px-2'}`}
        />
      </span>
    </label>
  );
}

function TariffPlanCard({ title, description, tone, perKm, base, commission, onPerKm, onBase, onCommission }) {
  const total = Math.round((Number(base) || 0) + (Number(perKm) || 0) * 5);
  const cut = Math.round(total * (Number(commission) || 0) / 100);
  const isNavy = tone === 'navy';

  return (
    <div className={`overflow-hidden rounded-2xl border ${isNavy ? 'border-navy-900/12 bg-slate-50/80' : 'border-accent/15 bg-accent/[0.04]'}`}>
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${isNavy ? 'bg-navy-900' : 'bg-accent'}`} />
          <p className="text-[12px] font-bold tracking-tight text-navy-900">{title}</p>
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{description}</p>
      </div>
      <div className="flex gap-1.5 px-3 pt-2.5">
        <TariffField label="$ / km" prefix="$" value={perKm} onChange={onPerKm} />
        <TariffField label="Base" prefix="$" value={base} onChange={onBase} />
        <TariffField label="Comisión %" value={commission} onChange={onCommission} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-black/[0.04] px-3 py-2">
        <p className="text-[10px] text-slate-400">Ejemplo 5 km</p>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums">
          <span className="text-navy-900">{moneyAr(total)}</span>
          <span className="text-[9px] font-medium text-slate-400">viaje</span>
          <span className="text-slate-300">·</span>
          <span className="text-amber-600">{moneyAr(cut)}</span>
          <span className="text-[9px] font-medium text-slate-400">comisión</span>
        </p>
      </div>
    </div>
  );
}

function DriverRow({ driver, isSelected, onClick }) {
  const tripStatus = driver.activeTrip ? getTripStatus(driver.activeTrip.status) : null;

  const statusTone = tripStatus
    ? `${tripStatus.bg} ${tripStatus.color}`
    : driver.isOnline
      ? 'bg-emerald-500/12 text-emerald-700'
      : 'bg-slate-100 text-slate-500';

  const statusLabel = tripStatus
    ? tripStatus.label
    : (driver.isOnline ? 'Disponible' : 'Offline');

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all duration-150 sm:items-center ${
        isSelected
          ? 'border-accent/25 bg-accent/5 ring-1 ring-accent/15 shadow-sm'
          : 'border-slate-100 bg-transparent hover:bg-slate-50/80 hover:border-slate-200'
      }`}
    >
      <div className="relative flex-shrink-0">
        <DriverAvatar
          photoUrl={driver.photoUrl}
          name={driver.fullName}
          size="sm"
          online={driver.isOnline}
        />
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
          {driver.isAssignedDriver ? (
            <span
              className="text-[8px] font-bold text-indigo-700 bg-indigo-500/10 px-1.5 py-0.5 rounded-md shrink-0 border border-indigo-500/15"
              title={`Chofer asignado · Móvil de ${driver.ownerName || 'propietario'}`}
            >
              Asignado
            </span>
          ) : null}
          {(driver.dispatchBlocked || driver.commissionOverdue) && (
            <span className="text-[9px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md shrink-0">⚠</span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {[driver.vehicleBrand, driver.vehicleModel].filter(Boolean).join(' ') || 'Sin vehículo'}
          {driver.vehiclePlate ? (
            <>
              <span className="text-gray-300 mx-1">·</span>
              <span className="font-semibold text-gray-400">{driver.vehiclePlate}</span>
            </>
          ) : null}
        </p>
        {driver.isAssignedDriver ? (
          <p className="text-[10px] text-indigo-600/90 truncate mt-0.5">
            Móvil {driver.driverNumber != null ? `#${driver.driverNumber}` : '—'}
            {driver.ownerPhone ? (
              <>
                <span className="text-gray-300 mx-1">·</span>
                Titular {driver.ownerPhone}
              </>
            ) : null}
          </p>
        ) : null}
        {driver.isOnline && driver.speed > 0.5 && (
          <p className="text-[10px] text-accent font-medium mt-1">{formatSpeed(driver.speed)} en movimiento</p>
        )}
      </div>

      {/* Status */}
      <div className="flex shrink-0 flex-col items-end sm:text-right">
        <span className={`inline-flex items-center text-[9px] font-semibold px-2 py-0.5 rounded-full ${statusTone}`}>
          {statusLabel}
        </span>
        <p className="text-[9px] text-slate-400 mt-0.5">{timeAgo(driver.updatedAt)}</p>
      </div>
    </button>
  );
}
