'use client';

import AssignFreeDriverPicker from './AssignFreeDriverPicker';
import CancelTripButton from './CancelTripButton';
import { canOperatorCancelTrip } from '../lib/passengerTripCancel';
import { DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS } from '../lib/promoteDueScheduledTrips';

const LIST_KINDS = new Set(['queue', 'trips', 'scheduled-due']);

export function isMapListPopover(kind) {
  return LIST_KINDS.has(kind);
}

export function listActiveDockTrips(trips = []) {
  return trips.filter((trip) => trip.isActive && !trip.isQueued);
}

export function formatWaitLabel(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function maskPhone(phone) {
  const value = String(phone || '');
  if (value.length > 6) return `···${value.slice(-4)}`;
  return value;
}

function tripStatusMeta(status) {
  if (status === 'in_progress') return { label: 'En curso', cls: 'bg-emerald-50 text-emerald-700' };
  if (status === 'going_to_pickup') return { label: 'En camino', cls: 'bg-sky-50 text-sky-700' };
  if (status === 'accepted') return { label: 'Asignado', cls: 'bg-sky-50 text-sky-700' };
  if (status === 'pending') return { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' };
  return { label: 'En cola', cls: 'bg-amber-50 text-amber-700' };
}

function DockCard({ tone = 'navy', title, meta, children, footer }) {
  const tones = {
    amber: { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800' },
    navy: { bar: 'bg-navy-900', chip: 'bg-slate-100 text-slate-600' },
    violet: { bar: 'bg-violet-600', chip: 'bg-violet-50 text-violet-700' },
  };
  const t = tones[tone] || tones.navy;

  return (
    <div
      role="dialog"
      aria-label={title}
      className="pointer-events-auto mb-1 flex w-[min(392px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_22px_54px_-18px_rgba(15,23,42,0.42)]"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className={`h-1.5 w-full ${t.bar}`} />
      <div className="flex items-start justify-between gap-3 px-4 pb-2.5 pt-3">
        <p className="text-[14px] font-bold tracking-tight text-slate-900">{title}</p>
        {meta ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.chip}`}>
            {meta}
          </span>
        ) : null}
      </div>
      <div className="map-dock-scroll max-h-[min(440px,56vh)] overflow-y-auto overscroll-contain px-2.5 pb-2">
        {children}
      </div>
      {footer}
    </div>
  );
}

function DockFooter({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border-t border-slate-100 bg-slate-50 px-4 py-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

function EmptyDock({ text }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-8 text-center">
      <p className="text-[12px] font-medium text-slate-400">{text}</p>
    </div>
  );
}

function QueueCard({ item, index, onCancelled }) {
  const origin = item.originAddress || item.pickupAddress || '—';
  const dest = item.destinationAddress || null;

  return (
    <article className="mb-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 last:mb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
              {item.position ?? index + 1}
            </span>
            <p className="truncate text-[13px] font-bold text-slate-900">{item.passengerName}</p>
          </div>
          {item.phone ? (
            <p className="mt-1 pl-8 text-[11px] text-slate-400">{maskPhone(item.phone)}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-amber-700 shadow-sm ring-1 ring-amber-100">
          {formatWaitLabel(item.waitMinutes)}
        </span>
      </div>

      <div className="mt-2.5 space-y-1.5 pl-1">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
          <p className="text-[12px] leading-snug text-slate-600">{origin}</p>
        </div>
        {dest ? (
          <div className="flex items-start gap-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded bg-navy-900" />
            <p className="text-[12px] leading-snug text-slate-600">{dest}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-[11px] text-slate-500">
        {item.price ? (
          <span className="font-bold text-emerald-700">
            ${Number(item.price).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </span>
        ) : null}
        {item.distanceKm ? <span>{Number(item.distanceKm).toFixed(1)} km</span> : null}
        {item.durationMinutes ? <span>{item.durationMinutes} min de viaje</span> : null}
        {item.dispatchAttempts > 0 ? (
          <span>{item.dispatchAttempts} intento{item.dispatchAttempts !== 1 ? 's' : ''}</span>
        ) : null}
      </div>

      <CancelTripButton
        compact
        className="mt-3"
        tripId={item.id}
        passengerName={item.passengerName}
        address={[origin, dest].filter(Boolean).join(' → ')}
        onCancelled={onCancelled}
      />
    </article>
  );
}

function LiveTripCard({ trip, onCancelled }) {
  const meta = tripStatusMeta(trip.status);
  const canCancel = canOperatorCancelTrip(trip);
  const driverName = trip.driver?.fullName || trip.driver?.full_name || (typeof trip.driver === 'string' ? trip.driver : null);

  return (
    <article className="mb-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 last:mb-0">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[13px] font-bold text-slate-900">{trip.passengerName}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-slate-600">{trip.pickupAddress || trip.destination || '—'}</p>
      {driverName ? (
        <p className="mt-1 text-[11px] text-slate-400">Móvil · {driverName}</p>
      ) : null}
      {canCancel ? (
        <CancelTripButton
          compact
          className="mt-3"
          tripId={trip.id}
          passengerName={trip.passengerName}
          address={trip.pickupAddress || trip.destination || ''}
          onCancelled={onCancelled}
        />
      ) : null}
    </article>
  );
}

function ScheduledCard({ item, drivers, onAssigned, onCancelled }) {
  return (
    <article className="mb-2 rounded-2xl border border-violet-100 bg-violet-50/50 p-3 last:mb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-slate-900">{item.passenger_name || 'Pasajero'}</p>
          {item.phone ? (
            <p className="mt-0.5 text-[11px] text-slate-400">{maskPhone(item.phone)}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-violet-700 shadow-sm ring-1 ring-violet-100">
          {item.countdown}
        </span>
      </div>
      {item.sourceLabel ? (
        <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
          {item.sourceLabel}{item.isDispatching ? ' · Buscando chofer' : ''}
        </p>
      ) : null}
      <div className="mt-2 space-y-1.5">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
          <p className="text-[12px] leading-snug text-slate-600">
            {item.pickupAddress || item.origin_address || item.destination_address || '—'}
          </p>
        </div>
        {item.destination_address && item.origin_address ? (
          <div className="flex items-start gap-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded bg-navy-900" />
            <p className="text-[12px] leading-snug text-slate-600">{item.destination_address}</p>
          </div>
        ) : null}
      </div>
      <AssignFreeDriverPicker
        compact
        trip={item}
        drivers={drivers}
        onAssigned={onAssigned}
      />
      <CancelTripButton
        compact
        className="mt-2"
        tripId={item.id}
        passengerName={item.passenger_name || 'Pasajero'}
        address={item.pickupAddress || item.origin_address || item.destination_address || ''}
        onCancelled={onCancelled}
      />
    </article>
  );
}

export default function MapDockPopovers({
  kind,
  queueData,
  liveTripsData,
  scheduledData,
  drivers,
  onCancelled,
  onOpenTrips,
  onOpenScheduled,
}) {
  if (kind === 'queue') {
    const list = queueData.queuedList || [];
    const avg = queueData.stats.avgWaitMinutes || 0;
    return (
      <DockCard
        tone="amber"
        title="Cola de espera"
        meta={`${queueData.stats.inQueue} ${queueData.stats.inQueue === 1 ? 'pasajero' : 'pasajeros'}${avg > 0 ? ` · media ${formatWaitLabel(avg)}` : ''}`}
        footer={<DockFooter onClick={onOpenTrips}>Ver panel completo →</DockFooter>}
      >
        {list.length === 0 ? (
          <EmptyDock text="Cola vacía" />
        ) : (
          list.map((item, index) => (
            <QueueCard key={item.id || index} item={item} index={index} onCancelled={onCancelled} />
          ))
        )}
      </DockCard>
    );
  }

  if (kind === 'trips') {
    const list = listActiveDockTrips(liveTripsData.allTrips);
    const activeCount = list.length;
    return (
      <DockCard
        tone="navy"
        title="Viajes activos"
        meta={`${activeCount} en curso`}
        footer={<DockFooter onClick={onOpenTrips}>Ver panel completo →</DockFooter>}
      >
        {list.length === 0 ? (
          <EmptyDock text="Sin viajes activos" />
        ) : (
          list.map((trip, index) => (
            <LiveTripCard key={trip.id || index} trip={trip} onCancelled={onCancelled} />
          ))
        )}
      </DockCard>
    );
  }

  if (kind === 'scheduled-due') {
    const list = scheduledData.dispatchSoonTrips || [];
    const minutes = DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS / 60000;
    return (
      <DockCard
        tone="violet"
        title="Programados a despachar"
        meta={`${scheduledData.stats.dispatchSoon} ${scheduledData.stats.dispatchSoon === 1 ? 'viaje' : 'viajes'} · ${minutes} min`}
        footer={<DockFooter onClick={onOpenScheduled}>Ver agenda completa →</DockFooter>}
      >
        {list.length === 0 ? (
          <EmptyDock text="Sin viajes en ventana" />
        ) : (
          list.map((item, index) => (
            <ScheduledCard
              key={item.id || index}
              item={item}
              drivers={drivers}
              onAssigned={() => scheduledData.refetch?.()}
              onCancelled={onCancelled}
            />
          ))
        )}
      </DockCard>
    );
  }

  return null;
}
