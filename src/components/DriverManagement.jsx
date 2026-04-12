import { useState, useMemo } from 'react';
import { useDriverManagement } from '../hooks/useDriverManagement';
import DriverFormModal from './DriverFormModal';
import DriverDetailPanel from './DriverDetailPanel';
import { formatPrice, timeAgo } from '../lib/utils';

export default function DriverManagement({ onBack }) {
  const { drivers, loading, createDriver, updateDriver, getDriverTrips, getDriverCommissionPayments, recordCommissionPayment, refetch } = useDriverManagement();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editDriver, setEditDriver] = useState(null);
  const [detailDriver, setDetailDriver] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (filter === 'active' && !d.is_available) return false;
      if (filter === 'inactive' && d.is_available) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (d.full_name || '').toLowerCase().includes(q) ||
          (d.phone || '').includes(q) ||
          (d.vehicle_plate || '').toLowerCase().includes(q) ||
          (d.driver_number?.toString() || '').includes(q)
        );
      }
      return true;
    });
  }, [drivers, search, filter]);

  const handleSave = async (formData) => {
    setSaving(true);
    setError('');
    try {
      if (editDriver) {
        const { email, password, ...profile } = formData;
        await updateDriver(editDriver.id, profile);
      } else {
        await createDriver(formData);
      }
      setShowForm(false);
      setEditDriver(null);
    } catch (err) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (driver) => {
    setEditDriver(driver);
    setShowForm(true);
  };

  const handleNewDriver = () => {
    setEditDriver(null);
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-light-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando choferes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-light-100">
      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all ${detailDriver ? 'mr-0' : ''}`}>
        {/* Header */}
        <div className="bg-light-50 border-b border-light-300/50 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="w-9 h-9 rounded-xl bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-navy-900">Gestión de Choferes</h1>
                <p className="text-xs text-gray-500">{drivers.length} choferes registrados</p>
              </div>
            </div>
            <button
              onClick={handleNewDriver}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent to-accent-light text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-accent/20 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nuevo Chofer
            </button>
          </div>

          {/* Search + Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
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
            <div className="flex gap-1 bg-light-300/60 rounded-xl p-1">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'active', label: 'Activos' },
                { key: 'inactive', label: 'Inactivos' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                    filter === f.key ? 'bg-accent text-white shadow-md shadow-accent/20' : 'text-gray-400 hover:text-navy-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
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
                  {filtered.map((driver) => (
                    <DriverTableRow
                      key={driver.id}
                      driver={driver}
                      onView={() => setDetailDriver(driver)}
                      onEdit={() => handleEdit(driver)}
                      isSelected={detailDriver?.id === driver.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {detailDriver && (
        <DriverDetailPanel
          driver={detailDriver}
          onClose={() => setDetailDriver(null)}
          onEdit={() => handleEdit(detailDriver)}
          getDriverTrips={getDriverTrips}
          getDriverCommissionPayments={getDriverCommissionPayments}
          recordCommissionPayment={recordCommissionPayment}
        />
      )}

      {/* Form modal */}
      {showForm && (
        <DriverFormModal
          driver={editDriver}
          onClose={() => { setShowForm(false); setEditDriver(null); setError(''); }}
          onSave={handleSave}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
}

function DriverTableRow({ driver, onView, onEdit, isSelected }) {
  const initials = (driver.full_name || 'NN')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <tr
      className={`border-b border-light-300/30 transition-all cursor-pointer ${
        isSelected ? 'bg-accent/5' : 'hover:bg-light-200/50'
      }`}
      onClick={onView}
    >
      {/* Driver info */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-light-200 flex items-center justify-center text-sm font-bold text-gray-400 flex-shrink-0 overflow-hidden">
            {driver.photo_url ? (
              <img src={driver.photo_url} alt="" className="w-full h-full object-cover" />
            ) : initials}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-navy-900">{driver.full_name}</p>
              {driver.driver_number && (
                <span className="text-[10px] font-bold text-accent bg-accent/15 px-1.5 py-0.5 rounded-md">#{driver.driver_number}</span>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              {driver.vehicle_type === 'moto' ? '🏍️' : '🚗'} {driver.vehicle_type || 'auto'}
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
        <span className={`inline-block text-[10px] font-semibold px-2.5 py-1 rounded-full ${
          driver.is_available ? 'bg-online/15 text-online' : 'bg-light-300/50 text-gray-500'
        }`}>
          {driver.is_available ? 'Activo' : 'Inactivo'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
