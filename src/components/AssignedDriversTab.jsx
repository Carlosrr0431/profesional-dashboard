import { useState, useEffect, useCallback, useRef } from 'react';
import { formatPhoneForDisplay, MAX_ASSIGNED_DRIVERS } from '../lib/driverRoles';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import DriverAvatar from './DriverAvatar';

function statusLabel(status) {
  if (status === 'registered') return { text: 'Registrado', className: 'bg-online/15 text-online' };
  return { text: 'Pendiente de registro', className: 'bg-amber-100 text-amber-700' };
}

export default function AssignedDriversTab({
  ownerDriver,
  fetchAssignedDrivers,
  createAssignedDriver,
  deleteAssignedDriver,
  toggleAssignedDriverStatus,
  getDriverTrips,
}) {
  const toast = useToast();
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [expandedTrips, setExpandedTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const channelRef = useRef(null);
  const refetchTimerRef = useRef(null);

  const loadAssigned = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const rows = await fetchAssignedDrivers(ownerDriver.id);
      setAssigned(rows);
    } catch (err) {
      toast.error(err?.message || 'No se pudieron cargar los choferes asignados');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ownerDriver.id, fetchAssignedDrivers, toast]);

  useEffect(() => {
    loadAssigned();
  }, [loadAssigned]);

  useEffect(() => {
    const scheduleReload = () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(() => {
        refetchTimerRef.current = null;
        loadAssigned({ silent: true });
      }, 250);
    };

    channelRef.current = supabase
      .channel(`assigned_drivers_${ownerDriver.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row) return;
          // Alta/baja/cambio de asignados de este titular, o cambios del propio titular
          if (row.id === ownerDriver.id || row.owner_id === ownerDriver.id) {
            scheduleReload();
          }
        },
      )
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [ownerDriver.id, loadAssigned]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      toast.warning('Completá nombre y teléfono');
      return;
    }
    if (assigned.length >= MAX_ASSIGNED_DRIVERS) {
      toast.warning(`Máximo ${MAX_ASSIGNED_DRIVERS} choferes asignados`);
      return;
    }

    setSaving(true);
    try {
      await createAssignedDriver(ownerDriver.id, {
        fullName: fullName.trim(),
        phone: phone.trim(),
      });
      setFullName('');
      setPhone('');
      await loadAssigned();
      toast.success('Chofer asignado agregado');
    } catch (err) {
      toast.error(err?.message || 'No se pudo agregar el chofer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`¿Eliminar a ${row.full_name} de los choferes asignados?`)) return;
    setBusyId(row.id);
    try {
      await deleteAssignedDriver(ownerDriver.id, row.id);
      if (expandedId === row.id) {
        setExpandedId(null);
        setExpandedTrips([]);
      }
      await loadAssigned();
      toast.success('Chofer asignado eliminado');
    } catch (err) {
      toast.error(err?.message || 'No se pudo eliminar');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleOnline = async (row) => {
    const next = !row.is_available;
    setBusyId(row.id);
    try {
      await toggleAssignedDriverStatus(ownerDriver.id, row.id, next);
      await loadAssigned();
      toast.success(next ? `${row.full_name} activado` : `${row.full_name} desactivado`);
    } catch (err) {
      toast.error(err?.message || 'No se pudo cambiar el estado');
    } finally {
      setBusyId(null);
    }
  };

  const handleExpand = async (row) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      setExpandedTrips([]);
      return;
    }
    setExpandedId(row.id);
    setLoadingTrips(true);
    try {
      const trips = await getDriverTrips(row.id);
      setExpandedTrips(trips.slice(0, 8));
    } catch {
      setExpandedTrips([]);
    } finally {
      setLoadingTrips(false);
    }
  };

  const slotsLeft = Math.max(0, MAX_ASSIGNED_DRIVERS - assigned.length);

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-light-300/60 bg-light-200/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-navy-900">Choferes del vehículo</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Hasta {MAX_ASSIGNED_DRIVERS} choferes con nombre y teléfono. Ingresan desde la app con
              &quot;Ingresar como chofer asignado&quot;. Solo uno puede estar en línea a la vez.
            </p>
          </div>
          <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-lg whitespace-nowrap">
            {assigned.length}/{MAX_ASSIGNED_DRIVERS}
          </span>
        </div>
      </div>

      {slotsLeft > 0 ? (
        <form onSubmit={handleCreate} className="rounded-xl border border-light-300/60 p-4 space-y-3 bg-light-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agregar chofer</p>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nombre completo"
            className="w-full bg-light-200 border border-light-300/50 rounded-xl px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-accent"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Teléfono (ej: 387 8630173)"
            className="w-full bg-light-200 border border-light-300/50 rounded-xl px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-accent to-accent-light rounded-xl disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Agregar chofer asignado'}
          </button>
        </form>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Cupo completo ({MAX_ASSIGNED_DRIVERS}/{MAX_ASSIGNED_DRIVERS}). Eliminá un chofer para agregar otro.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : assigned.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">Sin choferes asignados</p>
          <p className="text-xs mt-1">Agregá nombre y teléfono para que puedan usar este vehículo</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assigned.map((row) => {
            const status = statusLabel(row.registration_status);
            const isBusy = busyId === row.id;
            const isExpanded = expandedId === row.id;

            return (
              <div key={row.id} className="rounded-xl border border-light-300/60 bg-light-50 overflow-hidden">
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <DriverAvatar
                        photoUrl={row.photo_url}
                        name={row.full_name}
                        size="sm"
                        online={Boolean(row.is_available)}
                      />
                      <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900 truncate">{row.full_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatPhoneForDisplay(row.phone) || row.phone || '—'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.className}`}>
                          {status.text}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          row.is_available ? 'bg-online/15 text-online' : 'bg-light-300/60 text-gray-500'
                        }`}>
                          {row.is_available ? 'En línea' : 'Fuera de línea'}
                        </span>
                        <span className="text-[10px] font-medium text-gray-500 bg-light-200 px-2 py-0.5 rounded-full">
                          {row.total_trips || 0} viajes
                        </span>
                      </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleOnline(row)}
                        disabled={isBusy}
                        title={row.is_available ? 'Desactivar' : 'Activar'}
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs disabled:opacity-50 ${
                          row.is_available
                            ? 'border-online/30 text-online bg-online/10'
                            : 'border-light-300/60 text-gray-400 bg-light-200'
                        }`}
                      >
                        {row.is_available ? '⏸' : '▶'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={isBusy}
                        title="Eliminar"
                        className="w-8 h-8 rounded-lg border border-danger/20 text-danger bg-danger/5 disabled:opacity-50"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExpand(row)}
                    className="mt-2 text-[11px] font-medium text-accent hover:underline"
                  >
                    {isExpanded ? 'Ocultar viajes recientes' : 'Ver viajes recientes'}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="border-t border-light-300/50 bg-light-200/30 px-3 py-2">
                    {loadingTrips ? (
                      <p className="text-xs text-gray-500 py-2">Cargando viajes...</p>
                    ) : expandedTrips.length === 0 ? (
                      <p className="text-xs text-gray-500 py-2">Sin viajes registrados</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {expandedTrips.map((trip) => (
                          <li key={trip.id} className="text-[11px] text-gray-600">
                            <span className="font-medium text-navy-900">{trip.origin_address || 'Origen'}</span>
                            {' → '}
                            <span>{trip.destination_address || 'Destino'}</span>
                            <span className="text-gray-400 ml-1">({trip.status})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
