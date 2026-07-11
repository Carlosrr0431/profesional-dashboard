import { useState, useEffect } from 'react';
import { formatPhoneForDisplay, isAssignedDriver } from '../lib/driverRoles';

const FIELD_CLASS = 'w-full bg-light-200 border border-light-300/50 rounded-xl px-3 py-2.5 text-sm text-navy-900 placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all';
const LABEL_CLASS = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

function isPhoneLoginDriver(driver) {
  if (!driver) return false;
  const email = String(driver.auth_email || '').toLowerCase();
  return Boolean(driver.phone_normalized || driver.phone || email.endsWith('@profesional.test'));
}

export default function DriverFormModal({ driver, ownerName = null, onClose, onSave, saving, error }) {
  const isEdit = !!driver;
  const assigned = isEdit && isAssignedDriver(driver);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
    driver_number: '',
    vehicle_type: 'auto',
    vehicle_brand: '',
    vehicle_model: '',
    vehicle_plate: '',
    vehicle_color: '',
    license_expiry: '',
  });

  useEffect(() => {
    if (driver) {
      setForm({
        full_name: driver.full_name || '',
        phone: driver.phone || '',
        email: '',
        password: '',
        driver_number: driver.driver_number?.toString() || '',
        vehicle_type: driver.vehicle_type || 'auto',
        vehicle_brand: driver.vehicle_brand || '',
        vehicle_model: driver.vehicle_model || '',
        vehicle_plate: driver.vehicle_plate || '',
        vehicle_color: driver.vehicle_color || '',
        license_expiry: driver.license_expiry || '',
      });
    }
  }, [driver]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (data.driver_number) data.driver_number = parseInt(data.driver_number);
    else data.driver_number = null;
    if (!data.license_expiry) data.license_expiry = null;
    if (isEdit && !String(data.password || '').trim()) {
      delete data.password;
    }
    onSave(data);
  };

  const phoneLogin = isEdit && isPhoneLoginDriver(driver);
  const loginHint = phoneLogin
    ? `Ingreso con teléfono: ${formatPhoneForDisplay(driver.phone) || driver.phone || '—'}. Si lo cambiás, el número anterior deja de servir.`
    : driver?.auth_email
      ? `Cuenta: ${driver.auth_email}`
      : 'Sin cuenta de acceso vinculada';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-light-50 rounded-2xl shadow-2xl border border-light-300/50 w-full max-w-2xl max-h-[90vh] overflow-hidden animate-slideIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-light-300/50 flex items-center justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">{isEdit ? 'Editar Chofer' : 'Nuevo Chofer'}</h2>
              {isEdit ? (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    assigned
                      ? 'text-indigo-700 bg-indigo-100'
                      : 'text-amber-700 bg-amber-100'
                  }`}
                >
                  {assigned ? 'Asignado' : 'Titular'}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {!isEdit
                ? 'Registrar un nuevo chofer con acceso a la app'
                : assigned
                  ? (ownerName
                    ? `Chofer asignado · Vehículo de ${ownerName}`
                    : 'Chofer asignado al móvil de un titular')
                  : 'Chofer titular / dueño del móvil'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-5">
          {/* Auth section (only for new) */}
          {!isEdit && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                Credenciales de Acceso
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="chofer@email.com"
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Contraseña *</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
            </div>
          )}

          {isEdit ? (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-accent mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                Acceso a la app
              </h3>
              <p className="text-xs text-gray-500 mb-3">{loginHint}</p>
              <div>
                <label className={LABEL_CLASS}>Nueva contraseña</label>
                <input
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="Dejá vacío para no cambiar"
                  className={FIELD_CLASS}
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Opcional. Mínimo 8 caracteres. El chofer usará esta clave para ingresar a la app móvil.
                </p>
              </div>
            </div>
          ) : null}

          {/* Personal info */}
          <div>
            <h3 className="text-sm font-semibold text-navy-900 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Información Personal
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={LABEL_CLASS}>Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                  placeholder="Juan Pérez"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Teléfono</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+54 387 ..."
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Nº de Chofer</label>
                <input
                  type="number"
                  value={form.driver_number}
                  onChange={(e) => handleChange('driver_number', e.target.value)}
                  placeholder="Ej: 42"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Vencimiento Licencia</label>
                <input
                  type="date"
                  value={form.license_expiry}
                  onChange={(e) => handleChange('license_expiry', e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          </div>

          {/* Vehicle info */}
          <div>
            <h3 className="text-sm font-semibold text-navy-900 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Vehículo
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={LABEL_CLASS}>Tipo</label>
                <div className="flex gap-2">
                  {['auto', 'moto'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleChange('vehicle_type', t)}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                        form.vehicle_type === t
                          ? 'bg-accent/10 border-accent/30 text-accent'
                          : 'bg-light-200 border-light-300/50 text-gray-400 hover:text-navy-900'
                      }`}
                    >
                      {t === 'auto' ? '🚗' : '🏍️'} {t === 'auto' ? 'Auto' : 'Moto'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={LABEL_CLASS}>Marca</label>
                <input
                  type="text"
                  value={form.vehicle_brand}
                  onChange={(e) => handleChange('vehicle_brand', e.target.value)}
                  placeholder="Toyota"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Modelo</label>
                <input
                  type="text"
                  value={form.vehicle_model}
                  onChange={(e) => handleChange('vehicle_model', e.target.value)}
                  placeholder="Corolla"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Patente</label>
                <input
                  type="text"
                  value={form.vehicle_plate}
                  onChange={(e) => handleChange('vehicle_plate', e.target.value.toUpperCase())}
                  placeholder="AB 123 CD"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Color</label>
                <input
                  type="text"
                  value={form.vehicle_color}
                  onChange={(e) => handleChange('vehicle_color', e.target.value)}
                  placeholder="Blanco"
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-light-200 border border-light-300/50 text-gray-500 text-sm font-medium rounded-xl hover:bg-light-300/50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] py-2.5 px-4 bg-gradient-to-r from-accent to-accent-light text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : '🚖 Registrar Chofer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
