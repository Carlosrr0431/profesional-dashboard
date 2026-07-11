import { useState, useMemo, useEffect } from 'react';
import { useDriverManagement } from '../hooks/useDriverManagement';
import DriverFormModal from './DriverFormModal';
import DriverDetailPanel from './DriverDetailPanel';
import CommissionPaymentsReport from './CommissionPaymentsReport';
import { formatPrice, timeAgo } from '../lib/utils';
import { formatError } from '../lib/errorFormat';
import { useToast } from '../context/ToastContext';
import { isAssignedDriver, findOwnerPartners, getFleetListGroupKey, getDriverPhoneKey, normalizeDriverPhone } from '../lib/driverRoles';
import DriverAvatar from './DriverAvatar';

export default function DriverManagement({ onBack }) {
  const toast = useToast();
  const { drivers, loading, createDriver, updateDriver, getDriverTrips, getDriverCommissionPayments, recordCommissionPayment, toggleCommissionBlock, refetch, fetchAssignedDrivers, createAssignedDriver, deleteAssignedDriver, toggleAssignedDriverStatus } = useDriverManagement();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editDriver, setEditDriver] = useState(null);
  const [detailDriver, setDetailDriver] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDriver, setConfirmDriver] = useState(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [mainView, setMainView] = useState('drivers');
  const [pendingPartnerSave, setPendingPartnerSave] = useState(null);

  useEffect(() => {
    if (!detailDriver) return;
    const updated = drivers.find((d) => d.id === detailDriver.id);
    if (updated) setDetailDriver(updated);
  }, [drivers, detailDriver?.id]);

  const ownerById = useMemo(() => {
    const map = {};
    drivers.forEach((d) => {
      if (!isAssignedDriver(d)) map[d.id] = d;
    });
    return map;
  }, [drivers]);

  const assignedCountByOwner = useMemo(() => {
    const map = {};
    drivers.forEach((d) => {
      if (isAssignedDriver(d) && d.owner_id) {
        map[d.owner_id] = (map[d.owner_id] || 0) + 1;
      }
    });
    return map;
  }, [drivers]);

  const filtered = useMemo(() => {
    const matches = drivers.filter((d) => {
      if (filter === 'active' && !d.is_available) return false;
      if (filter === 'inactive' && d.is_available) return false;
      if (filter === 'blocked' && !d.commission_blocked) return false;
      if (filter === 'owes' && !(d.pending_commission > 0)) return false;
      if (search) {
        const q = search.toLowerCase();
        const ownerName = isAssignedDriver(d)
          ? (ownerById[d.owner_id]?.full_name || '')
          : '';
        return (
          (d.full_name || '').toLowerCase().includes(q) ||
          (d.phone || '').includes(q) ||
          (d.vehicle_plate || '').toLowerCase().includes(q) ||
          (d.driver_number?.toString() || '').includes(q) ||
          ownerName.toLowerCase().includes(q)
        );
      }
      return true;
    });

    // Agrupar: socios (mismo teléfono) juntos; titular(es) primero, luego asignados
    return matches.sort((a, b) => {
      const aGroup = getFleetListGroupKey(a, ownerById);
      const bGroup = getFleetListGroupKey(b, ownerById);
      if (aGroup !== bGroup) {
        const aOwner = isAssignedDriver(a) ? ownerById[a.owner_id] || a : a;
        const bOwner = isAssignedDriver(b) ? ownerById[b.owner_id] || b : b;
        const aNum = Number(aOwner.driver_number);
        const bNum = Number(bOwner.driver_number);
        if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
          return aNum - bNum;
        }
        return String(aOwner.full_name || '').localeCompare(String(bOwner.full_name || ''), 'es');
      }
      const aAssigned = isAssignedDriver(a) ? 1 : 0;
      const bAssigned = isAssignedDriver(b) ? 1 : 0;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      const aNum = Number(a.driver_number);
      const bNum = Number(b.driver_number);
      if (!aAssigned && !bAssigned && Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
        return aNum - bNum;
      }
      if (aAssigned && bAssigned && a.owner_id !== b.owner_id) {
        return String(a.owner_id).localeCompare(String(b.owner_id));
      }
      return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'es');
    });
  }, [drivers, search, filter, ownerById]);

  const applyDriverSave = async (formData) => {
    setSaving(true);
    setError('');
    try {
      if (editDriver) {
        const { email, password, ...profile } = formData;
        const updates = { ...profile };
        if (password) updates.password = password;
        const result = await updateDriver(editDriver.id, updates);
        const phoneChanged = String(profile.phone || '').trim() !== String(editDriver.phone || '').trim();
        const passwordMsg = password ? ' Contraseña de ingreso actualizada.' : '';
        const partners = result?.partners || [];
        const phoneMsg = phoneChanged
          ? (partners.length
            ? ` Teléfono unificado con ${partners.map((p) => p.full_name).join(', ')}: flotas de socios juntas.`
            : ' El ingreso a la app queda con el nuevo teléfono; el anterior ya no sirve.')
          : '';
        toast.success(`Chofer "${profile.full_name || editDriver.full_name}" actualizado.${passwordMsg}${phoneMsg}`);
      } else {
        await createDriver(formData);
        toast.success(`Chofer "${formData.full_name}" creado correctamente`);
      }
      setShowForm(false);
      setEditDriver(null);
      setPendingPartnerSave(null);
    } catch (err) {
      const message = err.message || 'Error al guardar';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (formData) => {
    if (editDriver && !isAssignedDriver(editDriver)) {
      const nextPhone = normalizeDriverPhone(formData.phone);
      const prevPhone = getDriverPhoneKey(editDriver);
      if (nextPhone && nextPhone !== prevPhone) {
        const partners = drivers.filter(
          (d) =>
            d.id !== editDriver.id
            && !isAssignedDriver(d)
            && getDriverPhoneKey(d) === nextPhone,
        );
        if (partners.length) {
          setPendingPartnerSave({ formData, partners });
          return;
        }
      }
    }
    await applyDriverSave(formData);
  };

  const handleEdit = (driver) => {
    setEditDriver(driver);
    setShowForm(true);
  };

  const handleNewDriver = () => {
    setEditDriver(null);
    setShowForm(true);
  };

  const handleMainViewChange = (view) => {
    setMainView(view);
    if (view === 'payments') {
      setDetailDriver(null);
    }
  };

  const handleMarkCommissionPaid = async (driver) => {
    setConfirmDriver(driver);
  };

  const handleConfirmMarkCommissionPaid = async () => {
    if (!confirmDriver) return;
    setConfirmingPayment(true);
    try {
      const result = await toggleCommissionBlock(confirmDriver.id);
      const amountPaid = parseFloat(result?.amountPaid || confirmDriver.pending_commission || 0);
      if (amountPaid > 0) {
        toast.success(`Pago de ${formatPrice(amountPaid)} registrado para ${confirmDriver.full_name}`);
      } else {
        toast.info(`${confirmDriver.full_name} ya no tiene comisión pendiente`);
      }
      setConfirmDriver(null);
    } catch (err) {
      console.error('Error marking commission as paid:', formatError(err));
      const message = err?.message || 'No se pudo registrar el pago de comision';
      setError(message);
      toast.error(message);
    } finally {
      setConfirmingPayment(false);
    }
  };

  if (loading) {
    return <DriverManagementLoading onBack={onBack} />;
  }

  return (
    <div className="h-full min-h-0 flex overflow-hidden bg-light-100">
      {/* Main content — ancho completo en vista global de pagos */}
      <div className={`min-h-0 flex flex-col overflow-hidden ${mainView === 'payments' ? 'flex-1 w-full' : 'flex-1'}`}>
        {/* Header */}
        <div className="bg-light-50 border-b border-light-300/50 px-4 py-3 lg:px-6 lg:py-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={onBack} className="w-9 h-9 shrink-0 rounded-xl bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-navy-900 truncate sm:text-xl">Gestión de Choferes</h1>
                <p className="text-xs text-gray-500">{drivers.length} choferes registrados</p>
              </div>
            </div>
            <button
              onClick={handleNewDriver}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-light px-4 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-accent/20 sm:w-auto"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nuevo Chofer
            </button>
          </div>

          <div className="mb-4 flex w-full gap-1 overflow-x-auto rounded-xl bg-light-300/60 p-1 scrollbar-none sm:w-fit">
            {[
              { key: 'drivers', label: 'Choferes' },
              { key: 'payments', label: 'Pagos de comisión' },
            ].map((view) => (
              <button
                key={view.key}
                type="button"
                onClick={() => handleMainViewChange(view.key)}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                  mainView === view.key
                    ? 'bg-navy-900 text-white shadow-md'
                    : 'text-gray-400 hover:text-navy-900'
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>

          {mainView === 'drivers' ? (
          <>
          {/* Search + Filters */}
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por nombre, teléfono, patente o número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-light-200 border border-light-300/50 rounded-xl pl-9 pr-3 py-2.5 text-sm text-navy-900 placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-light-300/60 p-1 scrollbar-none">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'active', label: 'Activos' },
                { key: 'inactive', label: 'Inactivos' },
                { key: 'owes', label: 'Deben' },
                { key: 'blocked', label: 'Bloqueados' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium rounded-lg transition-all sm:px-4 ${
                    filter === f.key ? 'bg-accent text-white shadow-md shadow-accent/20' : 'text-gray-400 hover:text-navy-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          </>
          ) : null}
        </div>

        {mainView === 'payments' ? (
          <CommissionPaymentsReport
            onSelectDriver={(driverId) => {
              const driver = drivers.find((d) => d.id === driverId);
              if (driver) {
                setMainView('drivers');
                setDetailDriver(driver);
              }
            }}
          />
        ) : (
        <div className="flex-1 overflow-auto p-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <svg className="w-16 h-16 mb-4 text-light-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">No se encontraron choferes</p>
            </div>
          ) : (
            <div className="bg-light-50 rounded-2xl border border-light-300/50 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-light-300/50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Chofer</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Vehículo</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Viajes</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rating</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((driver) => {
                    const partners = !isAssignedDriver(driver)
                      ? findOwnerPartners(drivers, driver)
                      : [];
                    return (
                    <DriverTableRow
                      key={driver.id}
                      driver={driver}
                      assignedCount={assignedCountByOwner[driver.id] || 0}
                      partnerCount={partners.length}
                      partnerNames={partners.map((p) => p.full_name).filter(Boolean)}
                      ownerName={
                        isAssignedDriver(driver)
                          ? (ownerById[driver.owner_id]?.full_name || null)
                          : null
                      }
                      onView={() => setDetailDriver(driver)}
                      onEdit={() => handleEdit(driver)}
                      isSelected={detailDriver?.id === driver.id}
                      onToggleBlock={() => handleMarkCommissionPaid(driver)}
                    />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Detail panel — oculto en vista global de pagos */}
      {detailDriver && mainView === 'drivers' && (
        <DriverDetailPanel
          driver={detailDriver}
          onClose={() => setDetailDriver(null)}
          onEdit={() => handleEdit(detailDriver)}
          getDriverTrips={getDriverTrips}
          getDriverCommissionPayments={getDriverCommissionPayments}
          recordCommissionPayment={recordCommissionPayment}
          toggleCommissionBlock={toggleCommissionBlock}
          fetchAssignedDrivers={fetchAssignedDrivers}
          createAssignedDriver={createAssignedDriver}
          deleteAssignedDriver={deleteAssignedDriver}
          toggleAssignedDriverStatus={toggleAssignedDriverStatus}
          assignedCount={assignedCountByOwner[detailDriver.id] || 0}
          partnerOwners={findOwnerPartners(drivers, detailDriver)}
        />
      )}

      {/* Form modal */}
      {showForm && (
        <DriverFormModal
          driver={editDriver}
          ownerName={
            editDriver && isAssignedDriver(editDriver)
              ? (ownerById[editDriver.owner_id]?.full_name || null)
              : null
          }
          onClose={() => { setShowForm(false); setEditDriver(null); setError(''); setPendingPartnerSave(null); }}
          onSave={handleSave}
          saving={saving}
          error={error}
        />
      )}

      {pendingPartnerSave ? (
        <PartnerPhoneConfirmModal
          partners={pendingPartnerSave.partners}
          phone={pendingPartnerSave.formData.phone}
          loading={saving}
          onCancel={() => setPendingPartnerSave(null)}
          onConfirm={() => applyDriverSave(pendingPartnerSave.formData)}
        />
      ) : null}

      {confirmDriver && (
        <ConfirmCommissionPaymentModal
          driver={confirmDriver}
          loading={confirmingPayment}
          onCancel={() => setConfirmDriver(null)}
          onConfirm={handleConfirmMarkCommissionPaid}
        />
      )}
    </div>
  );
}

function DriverManagementLoading({ onBack }) {
  const rows = Array.from({ length: 7 });

  return (
    <div className="h-full flex bg-light-100">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-light-50 border-b border-light-300/50 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="w-9 h-9 rounded-xl bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all"
                title="Volver"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-navy-900">Gestión de Choferes</h1>
                <p className="text-xs text-gray-500">Preparando lista de choferes...</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-accent/5 border border-accent/15 px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-medium text-accent">Sincronizando en tiempo real</span>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 h-[42px] rounded-xl bg-light-200/90 animate-pulse" />
            <div className="w-full max-w-full h-[42px] rounded-xl bg-light-200/90 animate-pulse sm:w-[360px]" />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="bg-light-50 rounded-2xl border border-light-300/50 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-light-300/50">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Chofer</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Vehículo</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Viajes</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rating</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((_, index) => (
                  <tr key={`driver-loading-${index}`} className="border-b border-light-300/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-light-200/90 animate-pulse" />
                        <div className="space-y-2">
                          <div className="h-3 w-36 rounded bg-light-200/90 animate-pulse" />
                          <div className="h-2.5 w-20 rounded bg-light-200/90 animate-pulse" />
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="h-3 w-28 rounded bg-light-200/90 animate-pulse" />
                    </td>

                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="h-3 w-32 rounded bg-light-200/90 animate-pulse" />
                        <div className="h-2.5 w-24 rounded bg-light-200/90 animate-pulse" />
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="h-3 w-8 mx-auto rounded bg-light-200/90 animate-pulse" />
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="h-3 w-10 mx-auto rounded bg-light-200/90 animate-pulse" />
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="h-6 w-20 mx-auto rounded-full bg-light-200/90 animate-pulse" />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <div className="w-8 h-8 rounded-lg bg-light-200/90 animate-pulse" />
                        <div className="w-8 h-8 rounded-lg bg-light-200/90 animate-pulse" />
                        <div className="w-8 h-8 rounded-lg bg-light-200/90 animate-pulse" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartnerPhoneConfirmModal({ partners, phone, loading, onCancel, onConfirm }) {
  const names = (partners || []).map((p) => p.full_name).filter(Boolean);

  return (
    <div className="fixed inset-0 z-[120] bg-navy-900/45 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-light-50 rounded-2xl border border-light-300/50 shadow-2xl shadow-navy-900/25 overflow-hidden">
        <div className="px-5 py-4 border-b border-light-300/40">
          <h3 className="text-sm font-bold text-navy-900">Unir flota de socios</h3>
          <p className="text-xs text-gray-500 mt-1">
            Ese teléfono ya lo usa otro titular. Al confirmar, quedan como socios y sus choferes asignados se ven juntos.
          </p>
        </div>

        <div className="px-5 py-4 space-y-2">
          <div className="flex items-center justify-between text-xs gap-3">
            <span className="text-gray-500 shrink-0">Teléfono</span>
            <span className="font-semibold text-navy-900 text-right truncate">{phone || '—'}</span>
          </div>
          <div className="flex items-start justify-between text-xs gap-3">
            <span className="text-gray-500 shrink-0">Socio{names.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-navy-900 text-right">{names.join(', ') || '—'}</span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-light-300/40 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 text-xs font-medium text-gray-600 bg-light-200 border border-light-300/60 rounded-xl hover:bg-light-300/60 disabled:opacity-50 transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 text-xs font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-all"
          >
            {loading ? 'Guardando…' : 'Confirmar unión'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmCommissionPaymentModal({ driver, loading, onCancel, onConfirm }) {
  const pending = parseFloat(driver?.pending_commission || 0);

  return (
    <div className="fixed inset-0 z-[110] bg-navy-900/45 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-light-50 rounded-2xl border border-light-300/50 shadow-2xl shadow-navy-900/25 overflow-hidden">
        <div className="px-5 py-4 border-b border-light-300/40">
          <h3 className="text-sm font-bold text-navy-900">Confirmar Pago de Comision</h3>
          <p className="text-xs text-gray-500 mt-1">Esta accion registrara un pago para saldar la deuda del chofer.</p>
        </div>

        <div className="px-5 py-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Chofer</span>
            <span className="font-semibold text-navy-900">{driver?.full_name || 'Sin nombre'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Monto a registrar</span>
            <span className="font-bold text-online">{formatPrice(pending)}</span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-light-300/40 flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 text-xs font-medium text-gray-600 bg-light-200 border border-light-300/60 rounded-xl hover:bg-light-300/60 disabled:opacity-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-online to-emerald-500 rounded-xl hover:shadow-lg hover:shadow-online/20 disabled:opacity-50 transition-all"
          >
            {loading ? 'Registrando...' : 'Confirmar Pago'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DriverTableRow({
  driver,
  assignedCount = 0,
  partnerCount = 0,
  partnerNames = [],
  ownerName = null,
  onView,
  onEdit,
  isSelected,
  onToggleBlock,
}) {
  const assigned = isAssignedDriver(driver);

  return (
    <tr
      className={`border-b border-light-300/30 transition-all cursor-pointer ${
        isSelected ? 'bg-accent/5' : assigned ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'hover:bg-light-200/50'
      }`}
      onClick={onView}
    >
      {/* Driver info */}
      <td className="px-4 py-3">
        <div className={`flex items-center gap-3 ${assigned ? 'pl-4' : ''}`}>
          <DriverAvatar
            photoUrl={driver.photo_url}
            name={driver.full_name}
            size="sm"
            online={!driver.commission_blocked && driver.is_available}
            className={`!w-10 !h-10 text-sm ${assigned ? 'bg-indigo-100 text-indigo-600' : ''}`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold text-navy-900 truncate">{driver.full_name}</p>
              {driver.driver_number ? (
                <span className="text-[10px] font-bold text-accent bg-accent/15 px-1.5 py-0.5 rounded-md">
                  #{driver.driver_number}
                </span>
              ) : null}
              {assigned ? (
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-md">
                  Asignado
                </span>
              ) : null}
              {!assigned && partnerCount > 0 ? (
                <span
                  className="text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-md"
                  title={partnerNames.length ? `Socio de ${partnerNames.join(', ')}` : 'Socio'}
                >
                  Socio{partnerCount > 1 ? ` · ${partnerCount}` : ''}
                </span>
              ) : null}
              {!assigned && assignedCount > 0 ? (
                <span className="text-[10px] font-bold text-online bg-online/10 px-1.5 py-0.5 rounded-md">
                  +{assignedCount} asignado{assignedCount !== 1 ? 's' : ''}
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-gray-500">
              {driver.vehicle_type === 'moto' ? '🏍️' : '🚗'} {driver.vehicle_type || 'auto'}
              {assigned && ownerName ? ` · Titular: ${ownerName}` : ''}
              {!assigned && partnerNames.length ? ` · Con ${partnerNames.join(', ')}` : ''}
            </p>
          </div>
        </div>
      </td>

      {/* Contact */}
      <td className="px-4 py-3">
        <p className="text-sm text-navy-900">{driver.phone || '—'}</p>
      </td>

      {/* Vehicle */}
      <td className="px-4 py-3">
        <p className="text-sm text-navy-900">{driver.vehicle_brand} {driver.vehicle_model}</p>
        <p className="text-[11px] text-gray-500">{driver.vehicle_plate || '—'} · {driver.vehicle_color || ''}</p>
      </td>

      {/* Trips */}
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-semibold text-navy-900">{driver.total_trips || 0}</span>
      </td>

      {/* Rating */}
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          <span className="text-sm font-medium text-navy-900">{parseFloat(driver.rating || 5).toFixed(1)}</span>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          <span className={`inline-block text-[10px] font-semibold px-2.5 py-1 rounded-full ${
            driver.commission_blocked
              ? 'bg-danger/15 text-danger'
              : driver.is_available
              ? 'bg-online/15 text-online'
              : 'bg-light-300/50 text-gray-500'
          }`}>
            {driver.commission_blocked ? '🔒 Bloqueado' : driver.is_available ? 'Activo' : 'Inactivo'}
          </span>
          {driver.pending_commission > 0 && (
            <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
              Debe ${parseFloat(driver.pending_commission).toFixed(0)}
            </span>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {driver.pending_commission > 0 && (
            <button
              onClick={() => onToggleBlock()}
              className="w-8 h-8 rounded-lg border flex items-center justify-center transition-all bg-online/10 border-online/30 text-online hover:bg-online/20"
              title="Marcar comision pagada"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6-1a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          )}
          <button
            onClick={onView}
            className="w-8 h-8 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all"
            title="Ver detalle"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          </button>
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-navy-900 hover:border-navy-500/30 transition-all"
            title="Editar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
