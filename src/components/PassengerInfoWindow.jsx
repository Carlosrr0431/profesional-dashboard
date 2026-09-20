import { timeAgo } from '../lib/utils';
import {
  canManuallyAssignExistingTrip,
  driverDisplayName,
} from '../lib/assignExistingTrip';
import AssignFreeDriverPicker from './AssignFreeDriverPicker';

function formatPickupAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) return 'Sin dirección';
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && /^A?\d{4}/i.test(parts[1])) return parts[0];
  return parts.slice(0, 2).join(', ');
}

function getQueueStatusMeta(status, extras = {}) {
  const key = String(status || '').toLowerCase();
  const nextId = extras.nextAfterTripId || extras.next_after_trip_id;
  if (nextId && (key === 'pending' || key === 'accepted')) {
    return {
      label: key === 'accepted' ? 'Siguiente reservado' : 'Siguiente viaje',
      className: 'bg-violet-50 text-violet-700 ring-violet-200',
      avatarClass: 'bg-violet-50 text-violet-700 ring-2 ring-violet-200',
      dotClass: 'bg-violet-600',
    };
  }
  if (key === 'pending') {
    return {
      label: 'Esperando aceptación',
      className: 'bg-rose-50 text-rose-600 ring-rose-200',
      avatarClass: 'bg-rose-50 text-rose-600 ring-2 ring-rose-200',
      dotClass: 'bg-rose-600',
    };
  }
  if (key === 'scheduled') {
    return {
      label: 'Programado',
      className: 'bg-sky-50 text-sky-700 ring-sky-200',
      avatarClass: 'bg-sky-50 text-sky-700 ring-2 ring-sky-200',
      dotClass: 'bg-sky-600',
    };
  }
  return {
    label: 'En cola',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
    avatarClass: 'bg-amber-50 text-amber-700 ring-2 ring-amber-200',
    dotClass: 'bg-amber-500',
  };
}

function resolveOfferedDriver(trip, drivers) {
  const id = trip?.driverId || trip?.driver_id;
  if (!id) return null;
  return (Array.isArray(drivers) ? drivers : []).find((driver) => driver?.id === id) || null;
}

function passengerInitials(name) {
  return String(name || 'P')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'P';
}

export default function PassengerInfoWindow({
  trip,
  drivers = [],
  onClose,
  onAssigned,
}) {
  const status = getQueueStatusMeta(trip?.status, trip);
  const initials = passengerInitials(trip?.passengerName);
  const canAssign = canManuallyAssignExistingTrip(trip);
  const offered = resolveOfferedDriver(trip, drivers);
  const pickup = formatPickupAddress(trip?.address || trip?.origin_address);
  const destinationRaw = String(trip?.destinationAddress || trip?.destination_address || '').trim();
  const destination = destinationRaw ? formatPickupAddress(destinationRaw) : '';
  const showDestination = Boolean(destination) && destination !== pickup;
  const nextAfterTripId = trip?.nextAfterTripId || trip?.next_after_trip_id;
  const offeredLabel = offered
    ? `${driverDisplayName(offered)}${offered.driverNumber != null ? ` · #${offered.driverNumber}` : ''}`
    : null;

  return (
    <div className="w-full overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80">
      <div className="flex items-start gap-3 px-4 pb-2.5 pt-3.5">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[13px] font-extrabold ${status.avatarClass}`}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-[15px] font-bold leading-tight text-navy-900">
              {trip?.passengerName || 'Pasajero'}
            </h3>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${status.className}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Espera {timeAgo(trip?.createdAt)}
            {trip?.passengerPhone ? ` · ${trip.passengerPhone}` : ''}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="mx-4 mb-3 space-y-2">
        <div className="rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Retiro</p>
          <p className="mt-0.5 text-[13px] font-semibold leading-snug text-slate-800">{pickup}</p>
        </div>
        {showDestination ? (
          <div className="rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Destino</p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-800">{destination}</p>
          </div>
        ) : null}
        {offeredLabel ? (
          <div className={`rounded-2xl px-3 py-2.5 ring-1 ${nextAfterTripId ? 'bg-violet-50 ring-violet-100' : 'bg-rose-50/90 ring-rose-100'}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${nextAfterTripId ? 'text-violet-600' : 'text-rose-500'}`}>
              {nextAfterTripId ? 'Siguiente viaje' : 'Ofertado a'}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-800">{offeredLabel}</p>
            <p className={`mt-0.5 text-[11px] leading-snug ${nextAfterTripId ? 'text-violet-700' : 'text-rose-600'}`}>
              {nextAfterTripId
                ? 'Arranca cuando termine el viaje actual. Si no acepta, podés derivarlo a otro móvil.'
                : 'Todavía no aceptó. Podés derivarlo a otro móvil, incluso si está en viaje.'}
            </p>
          </div>
        ) : null}
      </div>

      {canAssign ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
            Derivar ahora
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
            Si el chofer está ocupado, el viaje queda como siguiente y se activa al terminar el actual.
          </p>
          <AssignFreeDriverPicker
            trip={trip}
            drivers={drivers}
            compact
            onAssigned={() => {
              onAssigned?.();
              onClose?.();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export { formatPickupAddress, getQueueStatusMeta, resolveOfferedDriver };
