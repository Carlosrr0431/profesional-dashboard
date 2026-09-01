import { useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext';
import {
  canManuallyAssignExistingTrip,
  driverDisplayName,
  listFreeDashboardDrivers,
} from '../lib/assignExistingTrip';
import { assignExistingTripToDriver } from '../lib/assignExistingTripClient';

export default function AssignFreeDriverPicker({
  trip,
  drivers,
  onAssigned,
  compact = false,
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [assigningId, setAssigningId] = useState(null);

  const freeDrivers = useMemo(() => listFreeDashboardDrivers(drivers), [drivers]);

  if (!canManuallyAssignExistingTrip(trip)) return null;

  const handleAssign = async (driver) => {
    if (!driver?.id || assigningId) return;
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
      setOpen(false);
      onAssigned?.();
    } catch (err) {
      toast.error(err?.message || 'No se pudo asignar el chofer');
    } finally {
      setAssigningId(null);
    }
  };

  const busy = Boolean(assigningId);

  return (
    <div className={compact ? 'mt-2' : 'w-full'}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        className={compact
          ? 'w-full rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50'
          : 'text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-all disabled:opacity-50'}
      >
        {open ? 'Cerrar lista' : 'Asignar chofer'}
      </button>

      {open ? (
        <div className={`rounded-xl border border-violet-100 bg-white overflow-hidden ${compact ? 'mt-1.5' : 'mt-2'}`}>
          {freeDrivers.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] text-slate-400">No hay choferes libres</p>
          ) : (
            <div className="max-h-40 overflow-y-auto overscroll-contain">
              {freeDrivers.map((driver) => {
                const name = driverDisplayName(driver);
                const meta = [
                  driver.driverNumber != null ? `#${driver.driverNumber}` : null,
                  driver.vehiclePlate || null,
                ].filter(Boolean).join(' · ');
                const loadingThis = assigningId === driver.id;
                return (
                  <button
                    key={driver.id}
                    type="button"
                    disabled={busy}
                    onClick={() => handleAssign(driver)}
                    className="flex w-full items-center justify-between gap-2 border-b border-violet-50 px-2.5 py-2 text-left last:border-0 hover:bg-violet-50 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-semibold text-navy-900">{name}</span>
                      {meta ? (
                        <span className="block truncate text-[10px] text-slate-400">{meta}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold text-violet-600">
                      {loadingThis ? '...' : 'Asignar'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
