import { useState, useEffect } from 'react';
import { formatPhoneForDisplay, isAssignedDriver } from '../lib/driverRoles';
import {
  BILLING_MODE_COMMISSION,
  BILLING_MODE_WEEKLY,
  BILLING_MODE_LABELS,
  normalizeBillingMode,
} from '../lib/driverBilling';

const FIELD = 'w-full rounded-xl border border-slate-200/70 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all';
const LABEL = 'block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-1.5';

function Section({ icon, title, accent, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
      <div className={`flex items-center gap-2.5 border-b px-4 py-3 ${accent ? 'border-accent/15 bg-accent/4' : 'border-slate-100 bg-slate-50/60'}`}>
        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${accent ? 'bg-accent/12 text-accent' : 'bg-slate-100 text-slate-500'}`}>
          {icon}
        </span>
        <h3 className={`text-[13px] font-bold tracking-tight ${accent ? 'text-accent' : 'text-slate-900'}`}>{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function isPhoneLoginDriver(driver) {
  if (!driver) return false;
  const email = String(driver.auth_email || '').toLowerCase();
  return Boolean(driver.phone_normalized || driver.phone || email.endsWith('@profesional.test'));
}

export default function DriverFormModal({ driver, ownerName = null, onClose, onSave, saving, error }) {
  const isEdit = !!driver;
  const assigned = isEdit && isAssignedDriver(driver);
  const [showPasswordField, setShowPasswordField] = useState(false);

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', password: '',
    driver_number: '', vehicle_type: 'auto', vehicle_brand: '',
    vehicle_model: '', vehicle_plate: '', vehicle_color: '',
    license_expiry: '', billing_mode: BILLING_MODE_COMMISSION,
  });

  useEffect(() => {
    if (driver) {
      setForm({
        full_name: driver.full_name || '', phone: driver.phone || '',
        email: '', password: '',
        driver_number: driver.driver_number?.toString() || '',
        vehicle_type: driver.vehicle_type || 'auto',
        vehicle_brand: driver.vehicle_brand || '', vehicle_model: driver.vehicle_model || '',
        vehicle_plate: driver.vehicle_plate || '', vehicle_color: driver.vehicle_color || '',
        license_expiry: driver.license_expiry || '',
        billing_mode: normalizeBillingMode(driver.billing_mode),
      });
    }
  }, [driver]);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (data.driver_number) data.driver_number = parseInt(data.driver_number);
    else data.driver_number = null;
    if (!data.license_expiry) data.license_expiry = null;
    data.billing_mode = normalizeBillingMode(data.billing_mode);
    if (isEdit && !String(data.password || '').trim()) delete data.password;
    onSave(data);
  };

  const phoneLogin = isEdit && isPhoneLoginDriver(driver);
  const loginHint = phoneLogin
    ? `+${formatPhoneForDisplay(driver.phone) || driver.phone || '—'}`
    : driver?.auth_email || null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
      <div
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl shadow-slate-900/25 sm:rounded-2xl"
        style={{ maxHeight: 'min(92vh, 100dvh)', animation: 'slideIn 0.2s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200/70 bg-white px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${assigned ? 'bg-indigo-500/10 text-indigo-600' : 'bg-accent/10 text-accent'}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 truncate">{isEdit ? 'Editar chofer' : 'Nuevo chofer'}</h2>
                {isEdit ? (
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${assigned ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                    {assigned ? 'Asignado' : 'Titular'}
                  </span>
                ) : null}
              </div>
              <p className="text-[12px] text-slate-400 truncate">
                {!isEdit ? 'Registrar un nuevo chofer con acceso a la app'
                  : assigned ? (ownerName ? `Asignado al móvil de ${ownerName}` : 'Chofer asignado')
                  : 'Chofer titular · dueño del móvil'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="space-y-3 p-4 sm:p-5">

            {/* ── Acceso / Credenciales ──────────────────────────────────── */}
            <Section
              accent
              title={isEdit ? 'Acceso a la app' : 'Credenciales de acceso'}
              icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>}
            >
              {!isEdit ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Email *</label>
                    <input type="email" required value={form.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="chofer@email.com" className={FIELD} />
                  </div>
                  <div>
                    <label className={LABEL}>Contraseña *</label>
                    <input type="password" required minLength={6} value={form.password} onChange={(e) => handleChange('password', e.target.value)} placeholder="Mínimo 6 caracteres" className={FIELD} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-400">{phoneLogin ? 'Ingreso con teléfono' : 'Cuenta'}</p>
                      <p className="text-[13px] font-semibold text-slate-900 truncate">{loginHint || '—'}</p>
                      {!assigned && phoneLogin && (
                        <p className="mt-0.5 text-[11px] text-slate-400">Si cambiás el teléfono, el anterior deja de servir.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswordField((v) => !v)}
                      className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${showPasswordField ? 'bg-accent/12 text-accent' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                    >
                      {showPasswordField ? 'Cancelar' : 'Cambiar contraseña'}
                    </button>
                  </div>
                  {showPasswordField && (
                    <div className="mt-3">
                      <label className={LABEL}>Nueva contraseña</label>
                      <input
                        type="password" minLength={8} autoFocus autoComplete="new-password"
                        value={form.password} onChange={(e) => handleChange('password', e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className={FIELD}
                      />
                      <p className="mt-1.5 text-[11px] text-slate-400">El chofer usará esta clave para ingresar a la app móvil.</p>
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* ── Datos personales ───────────────────────────────────────── */}
            <Section
              title="Datos personales"
              icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zM21 20a9 9 0 10-18 0" /></svg>}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className={LABEL}>Nombre completo *</label>
                  <input type="text" required value={form.full_name} onChange={(e) => handleChange('full_name', e.target.value)} placeholder="Juan Pérez" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Teléfono</label>
                  <input type="tel" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="+54 387 …" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Nº de chofer</label>
                  <input type="number" value={form.driver_number} onChange={(e) => handleChange('driver_number', e.target.value)} placeholder="Ej: 42" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Vencimiento licencia</label>
                  <input type="date" value={form.license_expiry} onChange={(e) => handleChange('license_expiry', e.target.value)} className={FIELD} />
                </div>
              </div>
            </Section>

            {/* ── Modo de cobro ──────────────────────────────────────────── */}
            <Section
              title="Modo de cobro"
              icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            >
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { value: BILLING_MODE_COMMISSION, hint: '1 sem. trabajo + 3 días de gracia. Si no paga, se bloquea.' },
                  { value: BILLING_MODE_WEEKLY, hint: 'Siempre puede recibir viajes. Solo se bloquea manualmente.' },
                ].map((opt) => {
                  const active = form.billing_mode === opt.value;
                  return (
                    <button
                      key={opt.value} type="button"
                      onClick={() => handleChange('billing_mode', opt.value)}
                      className={`group relative rounded-xl border-2 p-3.5 text-left transition-all ${active ? 'border-accent bg-accent/6' : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'}`}
                    >
                      {active && (
                        <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
                          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 12 12"><path d="M10.2 3.8a.75.75 0 00-1.06 0L5.1 7.84 2.86 5.6a.75.75 0 10-1.06 1.06l2.78 2.78a.75.75 0 001.06 0l4.56-4.56a.75.75 0 000-1.06z"/></svg>
                        </span>
                      )}
                      <p className={`text-[13px] font-bold leading-tight ${active ? 'text-accent' : 'text-slate-800'}`}>{BILLING_MODE_LABELS[opt.value]}</p>
                      <p className={`mt-1 text-[11px] leading-relaxed ${active ? 'text-accent/70' : 'text-slate-400'}`}>{opt.hint}</p>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* ── Vehículo ───────────────────────────────────────────────── */}
            <Section
              title="Vehículo"
              icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m16 0V8a1 1 0 00-1-1h-3.5M6 8h2"/></svg>}
            >
              <div className="space-y-3">
                <div className="flex gap-2">
                  {[{ v: 'auto', label: 'Auto', emoji: '🚗' }, { v: 'moto', label: 'Moto', emoji: '🏍️' }].map(({ v, label, emoji }) => (
                    <button
                      key={v} type="button"
                      onClick={() => handleChange('vehicle_type', v)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${form.vehicle_type === v ? 'border-accent bg-accent/6 text-accent' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}`}
                    >
                      <span>{emoji}</span> {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Marca</label>
                    <input type="text" value={form.vehicle_brand} onChange={(e) => handleChange('vehicle_brand', e.target.value)} placeholder="Toyota" className={FIELD} />
                  </div>
                  <div>
                    <label className={LABEL}>Modelo</label>
                    <input type="text" value={form.vehicle_model} onChange={(e) => handleChange('vehicle_model', e.target.value)} placeholder="Corolla" className={FIELD} />
                  </div>
                  <div>
                    <label className={LABEL}>Patente</label>
                    <input type="text" value={form.vehicle_plate} onChange={(e) => handleChange('vehicle_plate', e.target.value.toUpperCase())} placeholder="AB 123 CD" className={FIELD} />
                  </div>
                  <div>
                    <label className={LABEL}>Color</label>
                    <input type="text" value={form.vehicle_color} onChange={(e) => handleChange('vehicle_color', e.target.value)} placeholder="Blanco" className={FIELD} />
                  </div>
                </div>
              </div>
            </Section>

            {/* ── Error ─────────────────────────────────────────────────── */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {error}
              </div>
            )}

          </div>

          {/* ── Footer fijo ─────────────────────────────────────────────── */}
          <div className="sticky bottom-0 flex gap-2.5 border-t border-slate-200/70 bg-white px-4 py-3.5 sm:px-5">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-[2] rounded-xl bg-navy-900 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : '🚖 Registrar chofer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
