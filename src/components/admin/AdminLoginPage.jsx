'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardBrand from '../DashboardBrand';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/admin/dashboard';
  const { user, loading, signIn } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 border-[3px] border-navy-900/15 rounded-full" />
          <div className="absolute inset-0 border-[3px] border-navy-900 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-navy-900/5 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accent/5 blur-3xl"
      />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <DashboardBrand imageClassName="h-11 w-auto max-w-[160px] object-contain" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-navy-900">
              Panel de operaciones
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Ingresá con tu cuenta de administrador para continuar.
            </p>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/90 p-7 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="admin-email" className="text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@profesional.app"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-navy-900/30 focus:ring-4 focus:ring-navy-dim"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="admin-password" className="text-sm font-medium text-gray-700">
                  Contraseña
                </label>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-navy-900/30 focus:ring-4 focus:ring-navy-dim"
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-navy-900 text-sm font-semibold text-white transition hover:bg-navy-900/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Ingresando...' : 'Ingresar al panel'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            Acceso restringido al equipo Profesional.
          </p>
        </div>
      </div>
    </div>
  );
}
