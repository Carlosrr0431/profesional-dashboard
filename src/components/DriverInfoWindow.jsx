import { timeAgo, formatSpeed, formatPrice, getTripStatus } from '../lib/utils';
import DriverAvatar from './DriverAvatar';
import { DriverRatingChip } from './DriverRatingView';
import TripNotesEditor from './TripNotesEditor';
import { dashboardDriverAvailability } from '../lib/assignExistingTrip';

function getDriverStatusInfo(driver) {
  const availability = dashboardDriverAvailability(driver);
  if (availability.code === 'blocked') {
    return {
      label: availability.label,
      className: 'bg-amber-50 text-amber-700 ring-amber-200',
      busy: true,
    };
  }
  if (availability.nextTrip) {
    return {
      label: availability.label,
      className: 'bg-violet-50 text-violet-700 ring-violet-200',
      busy: false,
      nextTrip: true,
    };
  }
  if (availability.code === 'reserved') {
    return {
      label: availability.label,
      className: 'bg-rose-50 text-rose-600 ring-rose-200',
      busy: true,
    };
  }
  if (driver.activeTrip) {
    const s = getTripStatus(driver.activeTrip.status);
    return {
      label: s.label,
      className: 'bg-rose-50 text-rose-600 ring-rose-200',
      busy: true,
    };
  }
  if (availability.canAssign) {
    return {
      label: 'Disponible',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      busy: false,
    };
  }
  return {
    label: availability.label || 'Desconectado',
    className: 'bg-slate-100 text-slate-500 ring-slate-200',
    busy: true,
  };
}

function Fact({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-600 ring-slate-100',
    plate: 'bg-white text-rose-600 ring-slate-200',
  };
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

export default function DriverInfoWindow({ driver, onAssignTrip, onSendAudio, onClose }) {
  const name = String(driver.fullName || 'Chofer').trim();
  const status = getDriverStatusInfo(driver);
  const canAssign = Boolean(dashboardDriverAvailability(driver).canAssign);
  const vehicleKind = driver.vehicleType === 'moto' ? 'Moto' : 'Auto';
  const vehicleLabel = [vehicleKind, driver.vehicleBrand, driver.vehicleModel].filter(Boolean).join(' ');
  const phone = driver.isAssignedDriver
    ? (driver.ownerPhone || driver.fleetContactPhone || 'Sin teléfono')
    : (driver.phone || 'Sin teléfono');
  const mobileLabel = driver.driverNumber != null
    ? (driver.isAssignedDriver ? `Móvil #${driver.driverNumber}` : `#${driver.driverNumber}`)
    : null;
  const meta = [
    phone,
    driver.isFleetOwner ? 'Titular' : null,
    driver.isAssignedDriver ? 'Asignado' : null,
    mobileLabel,
  ].filter(Boolean).join(' · ');

  let actionLabel = 'Asignar viaje';
  if (status.nextTrip) actionLabel = 'Siguiente viaje';
  else if (!canAssign) {
    if (driver.dispatchBlocked) {
      actionLabel = driver.commissionBlocked ? 'Bloqueo manual' : 'Bloqueado por comisión';
    } else if (driver.reservedNextTrip) actionLabel = 'Ya tiene siguiente';
    else if (driver.activeTrip) actionLabel = 'En viaje';
    else actionLabel = 'Desconectado';
  }

  return (
    <div className="w-full overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80">
      <div className="flex items-start gap-3 px-4 pb-2.5 pt-3.5">
        <DriverAvatar
          photoUrl={driver.photoUrl}
          name={name}
          size="md"
          online={driver.isOnline}
          ringClassName={driver.isOnline ? 'ring-2 ring-emerald-200' : 'ring-2 ring-slate-200'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-[15px] font-bold leading-tight text-navy-900">
              {name}
            </h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${status.className}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-slate-500">{meta}</p>
          {driver.isAssignedDriver && driver.ownerName ? (
            <p className="mt-0.5 truncate text-[11px] text-indigo-600">
              Vehículo de {driver.ownerName}
            </p>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
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

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        <Fact>{vehicleLabel}</Fact>
        {driver.vehiclePlate ? <Fact tone="plate">{driver.vehiclePlate}</Fact> : null}
        <Fact>{formatSpeed(driver.speed)}</Fact>
        <DriverRatingChip
          compact
          driver={{ rating: driver.rating, rating_count: driver.ratingCount }}
        />
        <Fact>{`${driver.totalTrips ?? 0} viajes`}</Fact>
        <span className="ml-auto text-[11px] font-medium text-slate-400">
          {timeAgo(driver.updatedAt)}
        </span>
      </div>

      {driver.activeTrip ? (
        <div className="mx-4 mb-3 rounded-2xl bg-rose-50/90 px-3 py-2.5 ring-1 ring-rose-100">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-rose-500">Viaje activo</p>
              <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-800">
                {driver.activeTrip.destination_address || 'Sin destino'}
              </p>
            </div>
          </div>
          <TripNotesEditor
            variant="inline"
            tripId={driver.activeTrip.id}
            notes={driver.activeTrip.notes}
            status={driver.activeTrip.status}
          />
        </div>
      ) : null}

      {driver.reservedNextTrip ? (
        <div className="mx-4 mb-3 rounded-2xl bg-violet-50 px-3 py-2.5 ring-1 ring-violet-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
            {driver.reservedNextTrip.status === 'pending' ? 'Siguiente en confirmación' : 'Siguiente viaje'}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-800">
            {driver.reservedNextTrip.destination_address || 'Sin destino'}
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        {driver.commissionBalance > 0 ? (
          <div className={`min-w-0 flex-1 ${driver.commissionOverdue ? 'text-rose-600' : 'text-amber-700'}`}>
            <p className="truncate text-[10px] font-bold uppercase tracking-wide">
              {driver.commissionOverdue ? 'Comisión vencida' : 'Comisión pendiente'}
            </p>
            <p className="truncate text-[15px] font-bold leading-tight">
              {formatPrice(driver.commissionBalance)}
            </p>
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {onSendAudio ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSendAudio(driver);
            }}
            title={`Enviar audio solo a ${name}`}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-accent/25 bg-accent/5 px-3 text-[13px] font-bold text-accent transition hover:bg-accent/10"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            Audio
          </button>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (canAssign && onAssignTrip) onAssignTrip(driver);
          }}
          disabled={!canAssign}
          title={
            canAssign
              ? (status.nextTrip ? 'Asignar como siguiente viaje' : 'Asignar un viaje')
              : driver.dispatchBlocked
                ? (driver.commissionBlocked ? 'Bloqueo manual' : 'Comisión vencida')
                : driver.reservedNextTrip
                  ? 'Ya tiene un siguiente viaje'
                  : driver.activeTrip
                    ? 'Chofer en viaje'
                    : 'Chofer desconectado'
          }
          className={`flex h-10 min-w-[7.5rem] items-center justify-center rounded-xl px-3.5 text-[13px] font-bold transition ${
            canAssign
              ? (status.nextTrip
                ? 'bg-violet-700 text-white shadow-sm hover:bg-violet-600'
                : 'bg-accent text-white shadow-sm hover:bg-accent-light')
              : 'cursor-not-allowed bg-slate-100 text-slate-400'
          }`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
