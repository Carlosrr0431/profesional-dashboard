import { timeAgo, formatSpeed, formatPrice, getTripStatus } from '../lib/utils';
import DriverAvatar from './DriverAvatar';

function getDriverStatusInfo(driver) {
  if (driver.commissionOverdue) {
    return {
      label: 'Bloqueado',
      className: 'bg-amber-50 text-amber-700 ring-amber-200',
      busy: true,
    };
  }
  if (driver.activeTrip) {
    const s = getTripStatus(driver.activeTrip.status);
    return {
      label: s.label,
      className: 'bg-red-50 text-red-600 ring-red-200',
      busy: true,
    };
  }
  if (driver.isOnline) {
    return {
      label: 'Disponible',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      busy: false,
    };
  }
  return {
    label: 'Desconectado',
    className: 'bg-slate-100 text-slate-500 ring-slate-200',
    busy: true,
  };
}

function Badge({ children, className }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ${className}`}
    >
      {children}
    </span>
  );
}

function InfoStat({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2 py-2.5 text-center ring-1 ring-slate-100">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-[13px] font-semibold text-navy-900">{value}</p>
    </div>
  );
}

export default function DriverInfoWindow({ driver, onAssignTrip, onClose }) {
  const name = String(driver.fullName || 'Chofer').trim();
  const status = getDriverStatusInfo(driver);
  const canAssign = !status.busy;
  const vehicleLabel = [driver.vehicleBrand, driver.vehicleModel].filter(Boolean).join(' ') || '—';
  const phone = driver.isAssignedDriver
    ? (driver.ownerPhone || driver.fleetContactPhone || 'Sin teléfono')
    : (driver.phone || 'Sin teléfono');

  let actionLabel = 'Asignar viaje';
  if (!canAssign) {
    if (driver.commissionOverdue) actionLabel = 'Bloqueado por comisión';
    else if (driver.activeTrip) actionLabel = 'En viaje';
    else actionLabel = 'Desconectado';
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
      {/* Header */}
      <div className="relative border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 pb-3.5 pt-4">
        <div className="flex items-start gap-3">
          <DriverAvatar
            photoUrl={driver.photoUrl}
            name={name}
            size="md"
            online={driver.isOnline}
            ringClassName={
              driver.isOnline
                ? 'ring-2 ring-emerald-200'
                : 'ring-2 ring-slate-200'
            }
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-[15px] font-bold leading-snug text-navy-900">
                {name}
              </h3>
              {onClose ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  aria-label="Cerrar"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg leading-none text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  ×
                </button>
              ) : null}
            </div>

            <p className="mt-0.5 truncate text-xs text-slate-500">{phone}</p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {driver.isFleetOwner ? (
                <Badge className="bg-amber-50 text-amber-700">Titular</Badge>
              ) : null}
              {driver.isAssignedDriver ? (
                <Badge className="bg-indigo-50 text-indigo-700">Asignado</Badge>
              ) : null}
              {driver.driverNumber != null ? (
                <Badge className="bg-red-50 text-red-600">
                  {driver.isAssignedDriver ? `Móvil #${driver.driverNumber}` : `#${driver.driverNumber}`}
                </Badge>
              ) : null}
              <Badge className={`ring-1 ${status.className}`}>{status.label}</Badge>
            </div>

            {driver.isAssignedDriver && driver.ownerName ? (
              <p className="mt-1.5 truncate text-[11px] text-indigo-600">
                Vehículo de {driver.ownerName}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 px-4 py-3.5">
        <div className="grid grid-cols-[auto_1fr_auto] gap-2">
          <div
            className={`flex min-w-[52px] flex-col items-center justify-center rounded-xl px-2.5 py-2.5 ${
              driver.vehicleType === 'moto'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-600'
            }`}
          >
            <span className="text-base leading-none" aria-hidden>
              {driver.vehicleType === 'moto' ? '🏍️' : '🚗'}
            </span>
            <span className="mt-1 text-[10px] font-bold">
              {driver.vehicleType === 'moto' ? 'Moto' : 'Auto'}
            </span>
          </div>

          <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Vehículo</p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-navy-900">{vehicleLabel}</p>
          </div>

          <div className="min-w-[72px] rounded-xl bg-slate-50 px-2.5 py-2.5 text-center ring-1 ring-slate-100">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Patente</p>
            <p className="mt-0.5 text-[13px] font-bold tracking-wide text-red-600">
              {driver.vehiclePlate || '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <InfoStat label="Velocidad" value={formatSpeed(driver.speed)} />
          <InfoStat label="Rating" value={`${Number(driver.rating || 0).toFixed(1)} ★`} />
          <InfoStat label="Viajes" value={String(driver.totalTrips ?? 0)} />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-400">Última actualización</span>
          <span className="shrink-0 font-semibold text-red-500">{timeAgo(driver.updatedAt)}</span>
        </div>

        {driver.activeTrip ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
            <p className="text-[11px] font-bold text-red-600">Viaje activo</p>
            <p className="mt-0.5 truncate text-xs text-slate-600">
              → {driver.activeTrip.destination_address || 'Sin destino'}
            </p>
          </div>
        ) : null}

        {driver.commissionBalance > 0 ? (
          <div
            className={`rounded-xl border px-3 py-2.5 ${
              driver.commissionOverdue
                ? 'border-red-100 bg-red-50'
                : 'border-amber-100 bg-amber-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p
                className={`min-w-0 truncate text-[11px] font-bold ${
                  driver.commissionOverdue ? 'text-red-600' : 'text-amber-700'
                }`}
              >
                {driver.commissionOverdue ? 'Comisión vencida' : 'Comisión pendiente'}
              </p>
              <p
                className={`shrink-0 text-sm font-bold ${
                  driver.commissionOverdue ? 'text-red-600' : 'text-amber-700'
                }`}
              >
                {formatPrice(driver.commissionBalance)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer action */}
      <div className="border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (canAssign && onAssignTrip) onAssignTrip(driver);
          }}
          disabled={!canAssign}
          title={
            canAssign
              ? 'Asignar un viaje'
              : driver.commissionOverdue
                ? 'Comisión vencida'
                : driver.activeTrip
                  ? 'Chofer en viaje'
                  : 'Chofer desconectado'
          }
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold transition ${
            canAssign
              ? 'bg-accent text-white shadow-sm hover:bg-accent-light'
              : 'cursor-not-allowed bg-slate-100 text-slate-400'
          }`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
