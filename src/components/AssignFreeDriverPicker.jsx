import { useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext';
import {
  canManuallyAssignExistingTrip,
  dashboardDriverAvailability,
  driverDisplayName,
  findDashboardDriversByNumber,
} from '../lib/assignExistingTrip';
import { assignExistingTripToDriver } from '../lib/assignExistingTripClient';

export default function AssignFreeDriverPicker({
  trip,
  drivers,
  onAssigned,
  compact = false,
  row = false,
  className = '',
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [assigningId, setAssigningId] = useState(null);

  const matches = useMemo(
    () => findDashboardDriversByNumber(drivers, query),
    [drivers, query],
  );
  const preferred = useMemo(
    () => matches.find((driver) => dashboardDriverAvailability(driver).canAssign) || matches[0] || null,
    [matches],
  );
  const availability = dashboardDriverAvailability(preferred);
  const hasQuery = Boolean(String(query || '').trim());

  if (!canManuallyAssignExistingTrip(trip)) return null;

  const handleAssign = async (driver) => {
    if (!driver?.id || assigningId) return;
    const status = dashboardDriverAvailability(driver);
    if (!status.canAssign) {
      toast.error(status.label || 'Ese chofer no está disponible');
      return;
    }
    setAssigningId(driver.id);
    try {
      const result = await assignExistingTripToDriver({
        tripId: trip.id,
        driverId: driver.id,
      });
      const name = driverDisplayName(driver);
      if (result?.notified === false) {
        toast.warning(`Asignado a ${name}, pero no se pudo notificar`);
      } else {
        toast.success(`Viaje asignado a ${name}`);
      }
      setQuery('');
      onAssigned?.();
    } catch (err) {
      toast.error(err?.message || 'No se pudo asignar el chofer');
    } finally {
      setAssigningId(null);
    }
  };

  const busy = Boolean(assigningId);
  const canAssignPreferred = Boolean(preferred && availability.canAssign && !busy);

  return (
    <div
      className={`${row || compact ? 'mt-2 w-full min-w-0' : 'w-full'} ${className}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        Número de móvil
      </label>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Ej: 12"
        value={query}
        disabled={busy}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && canAssignPreferred) {
            event.preventDefault();
            handleAssign(preferred);
          }
        }}
        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] font-bold tabular-nums text-navy-900 outline-none placeholder:font-medium placeholder:text-slate-300 focus:border-navy-900 focus:ring-2 focus:ring-navy-900/10 disabled:opacity-50"
      />

      {!hasQuery ? (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
          Escribí el número para ver el chofer y asignarlo.
        </p>
      ) : !preferred ? (
        <p className="mt-1.5 text-[11px] font-semibold text-rose-600">
          No hay un móvil con ese número.
        </p>
      ) : (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-navy-900">{driverDisplayName(preferred)}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                Móvil #{preferred.driverNumber}
                {preferred.vehiclePlate ? ` · ${preferred.vehiclePlate}` : ''}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                availability.canAssign
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              {availability.label}
            </span>
          </div>
          <button
            type="button"
            disabled={!canAssignPreferred}
            onClick={() => handleAssign(preferred)}
            className="mt-2 flex h-10 w-full items-center justify-center rounded-xl bg-navy-900 text-[13px] font-bold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {assigningId === preferred.id ? 'Asignando…' : `Asignar a ${driverDisplayName(preferred)}`}
          </button>
        </div>
      )}
    </div>
  );
}
