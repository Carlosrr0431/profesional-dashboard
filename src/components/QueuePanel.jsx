'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '../context/ToastContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatWait(minutes) {
  if (minutes < 1) return 'Recién ingresó';
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
  const isToday = new Date().toDateString() === d.toDateString();
  if (isToday) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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

function tripStatusInfo(status) {
  switch (status) {
    case 'pending':      return { label: 'Esperando chofer', color: 'bg-warning/15 text-warning border-warning/30' };
    case 'accepted':     return { label: 'Chofer asignado', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' };
    case 'going_to_pickup': return { label: 'En camino', color: 'bg-blue-600/15 text-blue-700 border-blue-600/30' };
    case 'in_progress':  return { label: 'En curso', color: 'bg-online/15 text-online border-online/30' };
    case 'completed':    return { label: 'Completado', color: 'bg-online/15 text-online border-online/30' };
    case 'cancelled':    return { label: 'Cancelado', color: 'bg-danger/15 text-danger border-danger/30' };
    default:             return { label: status || '—', color: 'bg-gray-100 text-gray-500 border-gray-300' };
  }
}

function positionColor(pos) {
  if (pos === 1) return 'bg-accent text-white shadow-md shadow-accent/30';
  if (pos === 2) return 'bg-warning/20 text-warning border border-warning/40';
  if (pos === 3) return 'bg-blue-500/15 text-blue-600 border border-blue-500/30';
  return 'bg-light-200 text-navy-700 border border-light-300';
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  const accentCls = {
    red:    'from-accent/8 border-accent/20',
    amber:  'from-warning/8 border-warning/20',
    green:  'from-online/8 border-online/20',
    navy:   'from-navy-700/5 border-navy-700/15',
  }[accent] || 'from-light-200 border-light-300';

  const valueCls = {
    red:   'text-accent',
    amber: 'text-warning',
    green: 'text-online',
    navy:  'text-navy-800',
  }[accent] || 'text-navy-800';

  return (
    <div className={`flex-1 rounded-2xl border bg-gradient-to-br ${accentCls} to-transparent px-4 py-3`}>
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueCls}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Queue Item ───────────────────────────────────────────────────────────────

function QueueItem({ item, isFirst }) {
  const urgentWait = item.waitMinutes >= 10;
  const longWait = item.waitMinutes >= 5;

  return (
    <div className={`relative flex items-start gap-3 p-3.5 rounded-2xl border transition-all
      ${isFirst
        ? 'bg-gradient-to-r from-accent/5 to-transparent border-accent/20 shadow-sm shadow-accent/10'
        : urgentWait
          ? 'bg-gradient-to-r from-warning/5 to-transparent border-warning/20'
          : 'bg-white/70 border-light-300/60 hover:border-light-400'
      }`}>

      {/* Position badge */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${positionColor(item.position)}`}>
        #{item.position}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-navy-900 truncate">{item.passengerName}</span>
            {isFirst && (
              <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">PRÓXIMO</span>
            )}
          </div>
          {/* Wait time */}
          <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full border
            ${urgentWait
              ? 'text-warning bg-warning/10 border-warning/30'
              : longWait
                ? 'text-amber-600 bg-amber-50 border-amber-200'
                : 'text-gray-500 bg-light-100 border-light-300'
            }`}>
            ⏱ {formatWait(item.waitMinutes)}
          </span>
        </div>

        {/* Phone */}
        <p className="text-[11px] text-gray-400 mt-0.5">{maskPhone(item.phone)}</p>

        {/* Pickup */}
        <div className="flex items-start gap-1 mt-1.5">
          <svg className="w-3 h-3 text-accent flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <p className="text-[12px] text-navy-800 font-medium leading-tight">{item.pickupAddress}</p>
        </div>

        {/* Destination if known */}
        {item.destination && (
          <div className="flex items-start gap-1 mt-1">
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            <p className="text-[11px] text-gray-400 leading-tight">{item.destination}</p>
          </div>
        )}

        {/* Queued timestamp */}
        <p className="text-[10px] text-gray-300 mt-1.5">
          En cola desde {formatDateTime(item.queuedAt)}
        </p>
      </div>
    </div>
  );
}

// ─── Dispatch Row ─────────────────────────────────────────────────────────────

function DispatchRow({ entry }) {
  const { label, color } = tripStatusInfo(entry.status);
  const driverName = entry.driver?.full_name || 'Chofer';
  const driverPlate = entry.driver?.vehicle_plate || '';
  const driverVehicle = [entry.driver?.vehicle_brand, entry.driver?.vehicle_model]
    .filter(Boolean).join(' ') || '';

  return (
    <div className="flex items-start gap-3 py-3 border-b border-light-200/70 last:border-0">
      {/* Time */}
      <div className="flex-shrink-0 text-right min-w-[52px]">
        <p className="text-[12px] font-semibold text-navy-800 tabular-nums">{formatTime(entry.dispatchedAt)}</p>
        <p className="text-[10px] text-gray-400">{timeAgo(entry.dispatchedAt)}</p>
      </div>

      {/* Arrow */}
      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-online/15 flex items-center justify-center mt-0.5">
        <svg className="w-3 h-3 text-online" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>

      {/* Passenger + driver info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="text-[12px] font-semibold text-navy-900">{entry.passengerName}</span>
            <span className="text-[11px] text-gray-400 ml-1.5">{maskPhone(entry.passengerPhone)}</span>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>
            {label}
          </span>
        </div>

        {/* Pickup */}
        <p className="text-[11px] text-gray-500 mt-0.5 truncate">📍 {entry.pickupAddress}</p>

        {/* Driver */}
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-4 h-4 rounded-full bg-navy-800/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-2.5 h-2.5 text-navy-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
          <span className="text-[12px] font-medium text-navy-800">{driverName}</span>
          {driverPlate && (
            <span className="text-[10px] font-bold text-gray-400 bg-light-200 border border-light-300 px-1.5 py-0.5 rounded-md">
              {driverPlate}
            </span>
          )}
          {driverVehicle && <span className="text-[10px] text-gray-400">{driverVehicle}</span>}
        </div>

        {/* Timeline for active trips */}
        {entry.acceptedAt && (
          <p className="text-[10px] text-gray-400 mt-1">
            Aceptado: {formatTime(entry.acceptedAt)}
            {entry.startedAt && ` · En curso: ${formatTime(entry.startedAt)}`}
            {entry.completedAt && ` · Completado: ${formatTime(entry.completedAt)}`}
          </p>
        )}
        {entry.cancelReason && (
          <p className="text-[10px] text-danger/80 mt-1">Cancelado: {entry.cancelReason}</p>
        )}
      </div>
    </div>
  );
}

// ─── Live dot ──────────────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="relative flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-online opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-online" />
      </span>
      <span className="text-[11px] font-medium text-online">En vivo</span>
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-online/10 flex items-center justify-center mb-3">
        <svg className="w-7 h-7 text-online" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-navy-800">Cola vacía</p>
      <p className="text-xs text-gray-400 mt-1">No hay pasajeros esperando chofer</p>
    </div>
  );
}

function EmptyLog() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-12 h-12 rounded-2xl bg-light-200 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <p className="text-xs text-gray-400">Sin despachos aún</p>
    </div>
  );
}

// ─── Main QueuePanel ──────────────────────────────────────────────────────────

export default function QueuePanel({ queuedList, dispatchLog, stats, loading, lastUpdated, refetch, onBack }) {
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [tickSeconds, setTickSeconds] = useState(0);

  // Tick every second to update wait times visually
  useEffect(() => {
    const t = setInterval(() => setTickSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    toast.success('Cola de espera actualizada');
  };

  const todayDispatches = dispatchLog.filter((d) => d.isToday);

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full bg-light-100/60 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:px-6 lg:py-4 bg-white/80 border-b border-light-300/60 backdrop-blur-sm flex-shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-light-100 border border-light-300/60 flex items-center justify-center text-gray-500 hover:text-navy-800 hover:bg-light-200 transition-all"
            title="Volver al mapa"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-warning to-amber-500 flex items-center justify-center shadow-md shadow-warning/30">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>

          <div className="min-w-0">
            <h2 className="text-navy-900 font-bold text-base leading-tight">Cola de espera</h2>
            <p className="hidden text-[11px] text-gray-400 sm:block">
              Monitoreo en tiempo real · Actualizado {lastUpdated ? lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LiveDot />
          <button
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
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 gap-3 overflow-x-auto px-4 py-4 lg:px-6 scrollbar-none">
        <StatCard
          label="En espera ahora"
          value={loading ? '—' : stats.inQueue}
          sub={stats.inQueue === 0 ? 'Cola vacía ✓' : `${stats.inQueue} pasajero${stats.inQueue !== 1 ? 's' : ''}`}
          accent="red"
        />
        <StatCard
          label="Despachados hoy"
          value={loading ? '—' : stats.dispatchedToday}
          sub="desde la cola"
          accent="green"
        />
        <StatCard
          label="Espera promedio"
          value={loading ? '—' : stats.inQueue > 0 ? formatWait(stats.avgWaitMinutes) : '—'}
          sub={stats.inQueue > 0 ? 'de los activos' : 'sin pasajeros'}
          accent="amber"
        />
        <StatCard
          label="Mayor espera"
          value={loading ? '—' : stats.inQueue > 0 ? formatWait(stats.longestWaitMinutes) : '—'}
          sub={stats.inQueue > 0 ? 'en cola' : 'sin pasajeros'}
          accent="navy"
        />
      </div>

      {/* ── Body (two columns) ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-5 lg:flex-row lg:gap-4 lg:px-6">

        {/* ── Left: Active queue ─────────────────────────────────────────── */}
        <div className="flex min-h-0 w-full flex-col lg:w-[45%]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-navy-900">Cola activa</h3>
              {stats.inQueue > 0 && (
                <span className="text-[11px] font-bold text-white bg-accent rounded-full px-1.5 py-0.5 leading-tight">
                  {stats.inQueue}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400">Orden FIFO · el #1 será despachado primero</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : queuedList.length === 0 ? (
              <EmptyQueue />
            ) : (
              queuedList.map((item, i) => (
                <QueueItem key={item.id} item={item} isFirst={i === 0} />
              ))
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="my-1 hidden w-px flex-shrink-0 self-stretch bg-light-300/60 lg:block" />

        {/* ── Right: Dispatch log ────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-navy-900">Historial de despachos</h3>
              {todayDispatches.length > 0 && (
                <span className="text-[11px] font-semibold text-online bg-online/10 border border-online/20 rounded-full px-1.5 py-0.5 leading-tight">
                  {todayDispatches.length} hoy
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400">Últimos {dispatchLog.length} despachos desde cola</p>
          </div>

          <div className="flex-1 overflow-y-auto bg-white/70 border border-light-300/60 rounded-2xl px-4 py-2 scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : dispatchLog.length === 0 ? (
              <EmptyLog />
            ) : (
              dispatchLog.map((entry) => (
                <DispatchRow key={entry.id} entry={entry} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
