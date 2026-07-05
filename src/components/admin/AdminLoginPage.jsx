'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardBrand from '../DashboardBrand';
import { useAdminAuth } from '../../hooks/useAdminAuth';

function LoginSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a1220]">
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
        <p className="text-sm font-medium tracking-wide text-white/50">Verificando sesión...</p>
      </div>
    </div>
  );
}

function MailIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function LockIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function EyeIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

const FEATURES = [
  {
    label: 'Mapa en tiempo real',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  {
    label: 'Cola de pasajeros',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    label: 'Gestión de flota',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
];

function BrandingPanel() {
  return (
    <div className="relative flex min-h-full flex-col bg-[#0a1220] px-8 py-10 xl:px-14 xl:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_10%,rgba(59,94,140,0.45),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_80%_90%,rgba(220,38,38,0.12),transparent_55%)]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8">
        <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md">
          <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-online" />
          <span className="text-xs font-medium tracking-wide text-white/70">Salta Capital · Operaciones</span>
        </div>

        <div className="w-fit rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5 backdrop-blur-sm">
          <DashboardBrand imageClassName="h-11 w-auto max-w-[170px] object-contain brightness-0 invert" />
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
            Tu centro de control operativo
          </h1>
          <p className="max-w-sm text-[15px] leading-relaxed text-white/55">
            Gestioná choferes, viajes y pasajeros desde un solo panel diseñado para el día a día.
          </p>
        </div>

        <ul className="grid gap-2.5">
          {FEATURES.map(({ label, icon }) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 backdrop-blur-sm"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80">
                {icon}
              </span>
              <span className="text-sm font-medium text-white/80">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-10 mx-auto mt-8 w-full max-w-md text-center text-xs text-white/30 lg:text-left">
        © {new Date().getFullYear()} Profesional Remis · Acceso restringido
      </p>
    </div>
  );
}

function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  focusedField,
  setFocusedField,
  error,
  submitting,
  onSubmit,
  centeredHeading = false,
}) {
  const inputBase =
    'admin-login-input h-12 w-full min-w-0 rounded-xl border bg-white px-11 text-[15px] text-navy-900 placeholder:text-gray-400 outline-none transition-all duration-200';
  const inputFocus = 'border-navy-900/30 shadow-[0_0_0_4px_rgba(15,23,42,0.06)]';
  const inputIdle = 'border-gray-200 hover:border-gray-300';

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className={centeredHeading ? 'mb-7 text-center' : 'mb-8'}>
        <h2 className="text-2xl font-semibold tracking-tight text-navy-900 sm:text-[1.65rem]">
          Bienvenido de nuevo
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
          Ingresá con tu cuenta de administrador para continuar.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200/70 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-7">
        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
          <div className="flex flex-col gap-2">
            <label htmlFor="admin-email" className="text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="relative">
              <span
                className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
                  focusedField === 'email' ? 'text-navy-900' : 'text-gray-400'
                }`}
              >
                <MailIcon className="h-[18px] w-[18px]" />
              </span>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                placeholder="admin@profesional.app"
                className={`${inputBase} ${focusedField === 'email' ? inputFocus : inputIdle}`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="admin-password" className="text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <div className="relative">
              <span
                className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
                  focusedField === 'password' ? 'text-navy-900' : 'text-gray-400'
                }`}
              >
                <LockIcon className="h-[18px] w-[18px]" />
              </span>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                placeholder="••••••••"
                className={`${inputBase} pr-11 ${focusedField === 'password' ? inputFocus : inputIdle}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOffIcon className="h-[18px] w-[18px]" /> : <EyeIcon className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </span>
              <p className="text-sm font-medium leading-snug text-red-700">{error}</p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-navy-900 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.2)] transition hover:bg-[#1a2744] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="flex items-center gap-2.5">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Ingresando...
              </span>
            ) : (
              'Ingresar al panel'
            )}
          </button>
        </form>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="text-center leading-snug">Acceso restringido al equipo Profesional</span>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/admin/dashboard';
  const { user, loading, signIn } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextPath);
    }
  }, [loading, user, router, nextPath]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace(nextPath);
    } catch (err) {
      const message = String(err?.message || '');
      if (message.toLowerCase().includes('invalid login credentials')) {
        setError('Email o contraseña incorrectos.');
      } else {
        setError('No pudimos iniciar sesión. Intentá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || user) {
    return <LoginSpinner />;
  }

  const formProps = {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    focusedField,
    setFocusedField,
    error,
    submitting,
    onSubmit: handleSubmit,
  };

  return (
    <div className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-[#eef1f6] lg:h-dvh lg:min-h-0 lg:flex-row">
        {/* Desktop — panel branding */}
        <aside className="hidden lg:block lg:h-full lg:w-[46%] xl:w-[50%] lg:overflow-y-auto">
          <BrandingPanel />
        </aside>

        {/* Mobile — header compacto */}
        <header className="relative shrink-0 overflow-hidden bg-[#0a1220] px-6 pb-14 pt-10 text-center lg:hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_0%,rgba(59,94,140,0.5),transparent_65%)]"
          />
          <div className="relative z-10 mx-auto flex max-w-sm flex-col items-center gap-4">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 backdrop-blur-md">
              <span className="mr-2 h-1.5 w-1.5 animate-pulse rounded-full bg-online" />
              <span className="text-[11px] font-medium tracking-wide text-white/70">Salta Capital · Operaciones</span>
            </div>
            <DashboardBrand imageClassName="h-10 w-auto max-w-[150px] object-contain brightness-0 invert" />
            <p className="text-sm leading-relaxed text-white/55">
              Panel de operaciones para tu equipo de remis
            </p>
          </div>
        </header>

        {/* Formulario */}
        <main className="relative z-10 flex flex-1 flex-col lg:h-full lg:overflow-y-auto">
          <div className="flex flex-1 flex-col justify-center px-5 pb-10 pt-0 sm:px-8 lg:px-12 lg:py-12 -mt-8 rounded-t-[28px] bg-[#eef1f6] lg:mt-0 lg:rounded-none">
            <LoginForm {...formProps} centeredHeading />
          </div>
        </main>
      </div>
  );
}
