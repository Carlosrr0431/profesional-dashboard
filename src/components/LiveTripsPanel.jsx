'use client';

import { useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Activos' },
  { id: 'queued', label: 'En cola' },
  { id: 'completed', label: 'Completados' },
  { id: 'cancelled', label: 'Cancelados' },
];

function formatTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const isToday = new Date().toDateString() === d.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `hace ${h}h` : `hace ${Math.floor(h / 24)}d`;
}

function maskPhone(phone) {
  const p = String(phone || '');
  if (p.length < 6) return p;
  return `+${p.slice(0, 2)} *** ${p.slice(-4)}`;
}

function formatPrice(value) {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function tripStatusInfo(status) {
  switch (status) {
    case 'queued':
      return { label: 'En cola', color: 'bg-warning/15 text-warning border-warning/30' };
    case 'pending':
      return { label: 'Esperando chofer', color: 'bg-warning/15 text-warning border-warning/30' };
    case 'accepted':
      return { label: 'Chofer asignado', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' };
    case 'going_to_pickup':
      return { label: 'En camino', color: 'bg-blue-600/15 text-blue-700 border-blue-600/30' };
    case 'in_progress':
      return { label: 'En curso', color: 'bg-online/15 text-online border-online/30' };
    case 'completed':
      return { label: 'Completado', color: 'bg-online/15 text-online border-online/30' };
    case 'cancelled':
      return { label: 'Cancelado', color: 'bg-danger/15 text-danger border-danger/30' };
    default:
      return { label: status || '—', color: 'bg-gray-100 text-gray-500 border-gray-300' };
  }
}

function StatCard({ label, value, sub, accent }) {
  const accentCls = {
    red: 'from-accent/8 border-accent/20',
    amber: 'from-warning/8 border-warning/20',
    green: 'from-online/8 border-online/20',
    navy: 'from-navy-700/5 border-navy-700/15',
    blue: 'from-blue-500/8 border-blue-500/20',
  }[accent] || 'from-light-200 border-light-300';

  const valueCls = {
    red: 'text-accent',
    amber: 'text-warning',
    green: 'text-online',
    navy: 'text-navy-800',
    blue: 'text-blue-700',
  }[accent] || 'text-navy-800';

  return (
    <div className={`flex-1 rounded-2xl border bg-gradient-to-br ${accentCls} to-transparent px-4 py-3`}>
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueCls}`}>{value}</p>
      {sub ? <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p> : null}
    </div>
  );
}

function TripCard({ trip }) {
  const { label, color } = tripStatusInfo(trip.status);
  const driverName = trip.driver?.full_name || null;
  const driverPlate = trip.driver?.vehicle_plate || '';
  const driverVehicle = [trip.driver?.vehicle_brand, trip.driver?.vehicle_model]
    .filter(Boolean)
    .join(' ');
  const priceLabel = formatPrice(trip.price);

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      trip.isActive
        ? 'border-blue-300/40 bg-gradient-to-r from-blue-50/70 to-white shadow-sm'
        : trip.status === 'cancelled'
          ? 'border-danger/20 bg-danger/[0.03]'
          : 'border-light-300/60 bg-white/80 hover:border-light-400'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-navy-900 truncate">{trip.passengerName}</span>
            <span className="text-[11px] text-gray-400">{maskPhone(trip.passengerPhone)}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {formatDateTime(trip.createdAt)} · {timeAgo(trip.createdAt)}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>
          {label}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <p className="text-[12px] text-navy-800 font-medium leading-tight">{trip.pickupAddress}</p>
        </div>
        {trip.driverOrigin && trip.driverOrigin !== trip.pickupAddress ? (
          <div className="flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <p className="text-[11px] text-gray-500 leading-tight">Origen chofer: {trip.driverOrigin}</p>
          </div>
        ) : null}
      </div>

      {driverName ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-navy-800/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-navy-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
          <span className="text-[12px] font-medium text-navy-800">{driverName}</span>
          {driverPlate ? (
            <span className="text-[10px] font-bold text-gray-400 bg-light-200 border border-light-300 px-1.5 py-0.5 rounded-md">
              {driverPlate}
            </span>
          ) : null}
          {driverVehicle ? <span className="text-[10px] text-gray-400">{driverVehicle}</span> : null}
        </div>
      ) : trip.status === 'queued' || trip.status === 'pending' ? (
        <p className="mt-3 text-[11px] text-warning font-medium">Sin chofer asignado</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400">
        {trip.acceptedAt ? <span>Aceptado {formatTime(trip.acceptedAt)}</span> : null}
        {trip.startedAt ? <span>En curso {formatTime(trip.startedAt)}</span> : null}
        {trip.completedAt ? <span>Completado {formatTime(trip.completedAt)}</span> : null}
        {priceLabel ? <span className="font-semibold text-navy-700">{priceLabel}</span> : null}
        {trip.distanceKm != null ? <span>{trip.distanceKm.toFixed(1)} km</span> : null}
        {trip.durationMinutes != null ? <span>{trip.durationMinutes} min</span> : null}
      </div>

      {trip.cancelReason ? (
        <p className="mt-2 text-[11px] text-danger/80">Cancelado: {trip.cancelReason}</p>
      ) : null}
    </div>
  );
}

function EmptyTrips({ filter }) {
  const message =
    filter === 'active'
      ? 'No hay viajes activos ahora'
      : filter === 'queued'
        ? 'No hay viajes en cola'
        : 'Sin viajes para mostrar';

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-light-200 flex items-center justify-center mb-3">
        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m16 0V8a1 1 0 00-1-1h-3.5" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-navy-800">{message}</p>
      <p className="text-xs text-gray-400 mt-1">Los nuevos viajes aparecen acá en tiempo real</p>
    </div>
  );
}

export default function LiveTripsPanel({ trips, stats, loading, lastUpdated, refetch }) {
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips.filter((trip) => {
      if (filter === 'active' && !trip.isActive) return false;
      if (filter === 'queued' && trip.status !== 'queued') return false;
      if (filter === 'completed' && trip.status !== 'completed') return false;
      if (filter === 'cancelled' && trip.status !== 'cancelled') return false;
      if (!q) return true;
      const haystack = [
        trip.passengerName,
        trip.passengerPhone,
        trip.pickupAddress,
        trip.driver?.full_name,
        trip.driver?.vehicle_plate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [trips, filter, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    toast.success('Viajes actualizados');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 lg:px-6">
        <p className="text-[11px] text-gray-400">
          Actualizado{' '}
          {lastUpdated
            ? lastUpdated.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : '—'}
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-navy-700 bg-light-200 border border-light-300/60 hover:bg-light-300/60 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      <div className="flex shrink-0 gap-3 overflow-x-auto px-4 py-4 lg:px-6 scrollbar-none">
        <StatCard label="Activos" value={loading ? '—' : stats.active} sub="en curso ahora" accent="blue" />
        <StatCard label="En cola" value={loading ? '—' : stats.queued} sub="esperando chofer" accent="amber" />
        <StatCard label="Completados hoy" value={loading ? '—' : stats.completedToday} sub="finalizados" accent="green" />
        <StatCard label="Cancelados hoy" value={loading ? '—' : stats.cancelledToday} sub="del día" accent="red" />
      </div>

      <div className="flex shrink-0 flex-col gap-3 px-4 pb-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-all ${
                  active
                    ? 'bg-navy-900 text-white'
                    : 'bg-white text-navy-700 border border-light-300/70 hover:bg-light-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pasajero, chofer o patente…"
            className="w-full rounded-xl border border-light-300/70 bg-white py-2 pl-9 pr-3 text-[12px] text-navy-800 outline-none placeholder:text-gray-400 focus:border-navy-700/30"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 lg:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredTrips.length === 0 ? (
          <EmptyTrips filter={filter} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {filteredTrips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
