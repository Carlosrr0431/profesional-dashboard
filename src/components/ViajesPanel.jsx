'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { toLocalDateInputValue } from '../hooks/useLiveTrips';

const STATUS_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Activos' },
  { id: 'queued', label: 'En cola' },
  { id: 'completed', label: 'Completados' },
  { id: 'cancelled', label: 'Cancelados' },
];

function formatWait(minutes) {
  if (minutes < 1) return 'Recién';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const isToday = toLocalDateInputValue() === toLocalDateInputValue(d);
  if (isToday) {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
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
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `hace ${h}h` : `hace ${Math.floor(h / 24)}d`;
}

function maskPhone(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  if (p.length < 6) return p || '—';
  return `+${p.slice(0, 2)} ··· ${p.slice(-4)}`;
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
      return { label: 'En cola', color: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' };
    case 'pending':
      return { label: 'Buscando chofer', color: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' };
    case 'accepted':
      return { label: 'Asignado', color: 'bg-sky-50 text-sky-700 border-sky-200', bar: 'bg-sky-500' };
    case 'going_to_pickup':
      return { label: 'En camino', color: 'bg-blue-50 text-blue-700 border-blue-200', bar: 'bg-blue-600' };
    case 'in_progress':
      return { label: 'En curso', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' };
    case 'completed':
      return { label: 'Completado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' };
    case 'cancelled':
      return { label: 'Cancelado', color: 'bg-rose-50 text-rose-700 border-rose-200', bar: 'bg-rose-500' };
    default:
      return { label: status || '—', color: 'bg-slate-50 text-slate-600 border-slate-200', bar: 'bg-slate-400' };
  }
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[11px] font-semibold text-emerald-700">En vivo</span>
    </span>
  );
}

function StatCard({ label, value, sub, tone = 'slate' }) {
  const tones = {
    rose: 'border-rose-200/80 from-rose-50/90',
    amber: 'border-amber-200/80 from-amber-50/90',
    sky: 'border-sky-200/80 from-sky-50/90',
    emerald: 'border-emerald-200/80 from-emerald-50/90',
    slate: 'border-slate-200/80 from-slate-50/90',
  };
  const values = {
    rose: 'text-rose-700',
    amber: 'text-amber-700',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
    slate: 'text-navy-900',
  };

  return (
    <div className={`min-w-[140px] flex-1 rounded-2xl border bg-gradient-to-br ${tones[tone]} to-white px-4 py-3 shadow-sm shadow-slate-900/5`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${values[tone]}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function QueueCard({ item, isFirst }) {
  const urgent = item.waitMinutes >= 10;
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm shadow-slate-900/5 ${
        isFirst ? 'border-rose-200 ring-1 ring-rose-100' : urgent ? 'border-amber-200' : 'border-slate-200/80'
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${isFirst ? 'bg-rose-500' : urgent ? 'bg-amber-400' : 'bg-slate-300'}`} />
      <div className="flex items-start gap-3 pl-1">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
          isFirst ? 'bg-rose-500 text-white' : 'bg-slate-100 text-navy-800'
        }`}>
          #{item.position}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-navy-900">{item.passengerName}</h4>
            {isFirst ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">
                Próximo
              </span>
            ) : null}
            <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
              urgent ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              {formatWait(item.waitMinutes)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">{maskPhone(item.phone)}</p>
          <p className="mt-2 text-[12px] font-medium leading-snug text-navy-800">{item.pickupAddress}</p>
          <p className="mt-1.5 text-[10px] text-slate-400">En cola desde {formatDateTime(item.queuedAt)}</p>
        </div>
      </div>
    </article>
  );
}

function TripCard({ trip }) {
  const { label, color, bar } = tripStatusInfo(trip.status);
  const driverName = trip.driver?.full_name || null;
  const driverPlate = trip.driver?.vehicle_plate || '';
  const driverVehicle = [trip.driver?.vehicle_brand, trip.driver?.vehicle_model].filter(Boolean).join(' ');
  const priceLabel = formatPrice(trip.price);

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5 transition hover:border-slate-300">
      <div className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-navy-900">{trip.passengerName}</h4>
            <span className="text-[11px] text-slate-500">{maskPhone(trip.passengerPhone)}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {formatDateTime(trip.createdAt)} · {timeAgo(trip.createdAt)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color}`}>
          {label}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 pl-1">
        <p className="text-[12px] font-medium leading-snug text-navy-800">{trip.pickupAddress}</p>
        {trip.driverOrigin && trip.driverOrigin !== trip.pickupAddress ? (
          <p className="text-[11px] text-slate-500">Origen chofer: {trip.driverOrigin}</p>
        ) : null}
      </div>

      {driverName ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-1">
          <span className="text-[12px] font-medium text-navy-800">{driverName}</span>
          {driverPlate ? (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
              {driverPlate}
            </span>
          ) : null}
          {driverVehicle ? <span className="text-[10px] text-slate-400">{driverVehicle}</span> : null}
        </div>
      ) : trip.status === 'queued' || trip.status === 'pending' ? (
        <p className="mt-3 pl-1 text-[11px] font-medium text-amber-600">Sin chofer asignado</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 pl-1 text-[10px] text-slate-400">
        {trip.acceptedAt ? <span>Aceptado {formatTime(trip.acceptedAt)}</span> : null}
        {trip.startedAt ? <span>En curso {formatTime(trip.startedAt)}</span> : null}
        {trip.completedAt ? <span>Fin {formatTime(trip.completedAt)}</span> : null}
        {priceLabel ? <span className="font-semibold text-navy-700">{priceLabel}</span> : null}
        {trip.distanceKm != null ? <span>{trip.distanceKm.toFixed(1)} km</span> : null}
      </div>

      {trip.cancelReason ? (
        <p className="mt-2 pl-1 text-[11px] text-rose-600">Cancelado: {trip.cancelReason}</p>
      ) : null}
    </article>
  );
}

export default function ViajesPanel({
  queueData,
  liveTripsData,
  onBack,
  selectedDate,
  onSelectedDateChange,
}) {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  const queuedList = queueData?.queuedList || [];
  const queueStats = queueData?.stats || {};
  const trips = liveTripsData?.trips || [];
  const tripStats = liveTripsData?.stats || {};
  const loading = Boolean(queueData?.loading || liveTripsData?.loading);
  const lastUpdated = liveTripsData?.lastUpdated || queueData?.lastUpdated;
  const loadError = liveTripsData?.error || null;
  const dateValue = selectedDate || toLocalDateInputValue();
  const isToday = dateValue === toLocalDateInputValue();

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const filteredTrips = useMemo(() => {
    void tick;
    const q = search.trim().toLowerCase();
    return trips.filter((trip) => {
      if (statusFilter === 'active' && !trip.isActive) return false;
      if (statusFilter === 'queued' && !trip.isQueued && trip.status !== 'queued') return false;
      if (statusFilter === 'completed' && trip.status !== 'completed') return false;
      if (statusFilter === 'cancelled' && trip.status !== 'cancelled') return false;
      // En "Todos" del día: priorizar viajes del día + activos/cola
      if (statusFilter === 'all' && !trip.isSelectedDay && !trip.isActive && !trip.isQueued) return false;
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
  }, [trips, statusFilter, search, tick]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queueData?.refetch?.(),
        liveTripsData?.refetch?.(),
      ]);
      toast.success('Panel de viajes actualizado');
    } finally {
      setRefreshing(false);
    }
  };

  const shiftDay = (delta) => {
    const [y, m, d] = dateValue.split('-').map(Number);
    const next = new Date(y, m - 1, d + delta);
    onSelectedDateChange?.(toLocalDateInputValue(next));
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      {/* Header */}
      <header className="flex shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between lg:px-6 lg:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-navy-800"
            title="Volver al mapa"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-navy-900 text-white shadow-md shadow-navy-900/20">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m16 0V8a1 1 0 00-1-1h-3.5M6 8h2" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-navy-900">Viajes</h2>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              Cola, despachos y monitoreo en un solo panel
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LiveDot />
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
              title="Día anterior"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              type="date"
              value={dateValue}
              max={toLocalDateInputValue()}
              onChange={(e) => onSelectedDateChange?.(e.target.value || toLocalDateInputValue())}
              className="h-8 rounded-lg border-0 bg-transparent px-1 text-[12px] font-semibold text-navy-900 outline-none"
            />
            <button
              type="button"
              onClick={() => shiftDay(1)}
              disabled={isToday}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              title="Día siguiente"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {!isToday ? (
              <button
                type="button"
                onClick={() => onSelectedDateChange?.(toLocalDateInputValue())}
                className="mr-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-navy-800 hover:bg-slate-50"
              >
                Hoy
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-navy-800 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 lg:px-6 lg:py-5">
          {/* Stats */}
          <section className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            <StatCard
              label="En cola"
              value={loading ? '—' : queueStats.inQueue ?? 0}
              sub={queueStats.inQueue ? 'esperando despacho' : 'cola vacía'}
              tone="rose"
            />
            <StatCard
              label="Activos"
              value={loading ? '—' : tripStats.active ?? 0}
              sub="en curso ahora"
              tone="sky"
            />
            <StatCard
              label="Despachados"
              value={loading ? '—' : tripStats.dispatchedDay ?? 0}
              sub={isToday ? 'hoy' : 'del día'}
              tone="emerald"
            />
            <StatCard
              label="Completados"
              value={loading ? '—' : tripStats.completedDay ?? 0}
              sub={isToday ? 'hoy' : 'del día'}
              tone="emerald"
            />
            <StatCard
              label="Cancelados"
              value={loading ? '—' : tripStats.cancelledDay ?? 0}
              sub={isToday ? 'hoy' : 'del día'}
              tone="amber"
            />
          </section>

          {loadError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              No se pudieron cargar los viajes: {loadError}
            </div>
          ) : null}

          {/* Cola */}
          <section className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-sm shadow-slate-900/5 lg:p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-navy-900">Cola activa</h3>
                <p className="text-[11px] text-slate-500">Orden FIFO · el #1 se despacha primero</p>
              </div>
              <p className="text-[11px] text-slate-400">
                {lastUpdated
                  ? `Actualizado ${lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : '—'}
              </p>
            </div>

            {loading && queuedList.length === 0 ? (
              <div className="flex justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy-900 border-t-transparent" />
              </div>
            ) : queuedList.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-10 text-center">
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-navy-900">Cola vacía</p>
                <p className="mt-1 text-xs text-slate-500">No hay pasajeros esperando chofer</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {queuedList.map((item, index) => (
                  <QueueCard key={item.id} item={item} isFirst={index === 0} />
                ))}
              </div>
            )}
          </section>

          {/* Despachos / viajes del día */}
          <section className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-sm shadow-slate-900/5 lg:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-bold text-navy-900">
                  {isToday ? 'Viajes y despachos de hoy' : `Viajes del ${dateValue.split('-').reverse().join('/')}`}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Se actualizan solos con Supabase Realtime
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 scrollbar-none">
                  {STATUS_FILTERS.map((item) => {
                    const active = statusFilter === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setStatusFilter(item.id)}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                          active
                            ? 'bg-navy-900 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-white hover:text-navy-900'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <div className="relative w-full sm:w-64">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar pasajero, chofer o patente…"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-[12px] text-navy-900 outline-none placeholder:text-slate-400 focus:border-navy-700/30 focus:ring-4 focus:ring-navy-900/5"
                  />
                </div>
              </div>
            </div>

            {loading && filteredTrips.length === 0 ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy-900 border-t-transparent" />
              </div>
            ) : filteredTrips.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-14 text-center">
                <p className="text-sm font-semibold text-navy-900">Sin viajes para este filtro</p>
                <p className="mt-1 text-xs text-slate-500">Probá otro día o cambiá el estado</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
