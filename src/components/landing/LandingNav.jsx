'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import LandingLogo from './LandingLogo';

const LINKS = [
  { href: '#app-pasajero', label: 'Pasajeros' },
  { href: '#app-conductor', label: 'Conductores' },
  { href: '#how', label: 'Cómo funciona' },
  { href: '/contacto', label: 'Contacto', isRoute: true },
];

const CTA_CLASS = [
  'group inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-full',
  'bg-navy-900 px-4 text-[13px] font-semibold tracking-tight text-white',
  'shadow-[0_10px_24px_-12px_rgba(15,23,42,0.55)]',
  'transition-[background-color,box-shadow,transform] duration-200',
  'hover:bg-navy-800 hover:-translate-y-px',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900/35 focus-visible:ring-offset-2',
  'active:translate-y-0',
].join(' ');

function ArrowIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.4}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function PedirViajeButton({ onClick, className = '' }) {
  return (
    <Link href="/pasajero" onClick={onClick} className={`${CTA_CLASS} ${className}`}>
      Pedir viaje
      <ArrowIcon />
    </Link>
  );
}

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
      <header className="sticky top-0 z-50 border-b border-light-300/70 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6 lg:px-8">
          <Link
            href="/"
            className="min-w-0 shrink touch-manipulation rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900/25 focus-visible:ring-offset-2"
            onClick={close}
          >
            <LandingLogo size="sm" className="sm:hidden" />
            <LandingLogo size="md" className="hidden sm:inline-flex" />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Principal">
            {LINKS.map((link) =>
              link.isRoute ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[13px] font-medium text-slate-500 transition-colors duration-200 hover:text-navy-900 focus-visible:outline-none focus-visible:text-navy-900"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-[13px] font-medium text-slate-500 transition-colors duration-200 hover:text-navy-900 focus-visible:outline-none focus-visible:text-navy-900"
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2">
            <PedirViajeButton className="px-5" />

            <button
              type="button"
              className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-light-300 bg-white text-navy-900 transition-colors duration-200 hover:bg-light-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900/25 focus-visible:ring-offset-2 lg:hidden"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
            >
              {open ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button
            type="button"
            className="absolute inset-0 bg-navy-900/20 backdrop-blur-sm"
            aria-label="Cerrar menú"
            onClick={close}
          />
          <div className="absolute left-0 right-0 top-[calc(4rem+env(safe-area-inset-top))] max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto overscroll-contain border-b border-light-300 bg-white px-4 py-5 shadow-2xl sm:top-[calc(4.25rem+env(safe-area-inset-top))]">
            <nav className="flex flex-col gap-1" aria-label="Menú móvil">
              {LINKS.map((link) =>
                link.isRoute ? (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={close}
                    className="rounded-xl px-4 py-3.5 text-base font-semibold text-navy-900 transition-colors duration-200 hover:bg-light-100"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={close}
                    className="rounded-xl px-4 py-3.5 text-base font-semibold text-navy-900 transition-colors duration-200 hover:bg-light-100"
                  >
                    {link.label}
                  </a>
                ),
              )}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
