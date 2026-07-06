'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import LandingLogo from './LandingLogo';

const LINKS = [
  { href: '#apps', label: 'Apps' },
  { href: '#features', label: 'Funciones' },
  { href: '#how', label: 'Cómo funciona' },
  { href: '/contacto', label: 'Contacto', isRoute: true },
];

export default function LandingNav({ open, onOpenChange }) {
  const setOpen = onOpenChange;

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const close = () => setOpen(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050a14]/85 backdrop-blur-xl supports-[backdrop-filter]:bg-[#050a14]/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/" className="shrink-0" onClick={close}>
            <LandingLogo size="sm" className="sm:hidden" />
            <LandingLogo size="md" className="hidden sm:inline-flex" />
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Principal">
            {LINKS.map((link) =>
              link.isRoute ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-white/60 transition hover:text-white"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-white/60 transition hover:text-white"
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/login"
              className="hidden rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/5 md:inline-flex"
            >
              Operadores
            </Link>
            <a
              href="#apps"
              className="hidden rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-light sm:inline-flex"
            >
              Descargar
            </a>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white lg:hidden"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
            >
              {open ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-[#050a14]/70 backdrop-blur-sm"
            aria-label="Cerrar menú"
            onClick={close}
          />
          <div className="absolute left-0 right-0 top-[57px] border-b border-white/10 bg-[#070d18] px-4 py-5 shadow-2xl sm:top-[65px]">
            <nav className="flex flex-col gap-1" aria-label="Menú móvil">
              {LINKS.map((link) =>
                link.isRoute ? (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={close}
                    className="rounded-xl px-4 py-3.5 text-base font-semibold text-white/85 transition hover:bg-white/5"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={close}
                    className="rounded-xl px-4 py-3.5 text-base font-semibold text-white/85 transition hover:bg-white/5"
                  >
                    {link.label}
                  </a>
                ),
              )}
              <Link
                href="/admin/login"
                onClick={close}
                className="mt-2 rounded-xl border border-white/10 px-4 py-3.5 text-center text-base font-semibold text-white/80"
              >
                Panel operadores
              </Link>
              <a
                href="#apps"
                onClick={close}
                className="mt-2 rounded-xl bg-accent px-4 py-3.5 text-center text-base font-bold text-white shadow-lg shadow-accent/20"
              >
                Descargar apps
              </a>
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
