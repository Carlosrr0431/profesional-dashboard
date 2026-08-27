'use client';

import Link from 'next/link';

export const spaFieldClass =
  'h-12 w-full rounded-2xl border border-light-300 bg-light-100 px-4 text-sm font-medium text-navy-900 outline-none placeholder:text-slate-400 focus:border-navy-900 focus:bg-white focus:ring-4 focus:ring-navy-900/10 disabled:bg-light-200 disabled:text-slate-500';

export function SpaBrand({ subtitle }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white">
        <span className="text-[13px] font-extrabold tracking-tight">P</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight text-navy-900">Profesional</p>
        <p className="truncate text-[11px] font-medium text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

export function SpaNotice({ tone = 'info', children }) {
  const tones = {
    info: 'bg-accent-dim text-accent',
    error: 'bg-red-50 text-red-700',
    success: 'bg-emerald-50 text-emerald-800',
    warn: 'bg-amber-50 text-amber-800',
  };
  return (
    <p className={`rounded-2xl px-3.5 py-2.5 text-sm ${tones[tone] || tones.info}`}>
      {children}
    </p>
  );
}

export function SpaButton({ children, onClick, disabled, variant = 'primary', type = 'button', className = '' }) {
  const variants = {
    primary: 'bg-navy-900 text-white hover:bg-navy-800',
    accent: 'bg-accent text-white hover:bg-accent-light',
    ghost: 'bg-white text-navy-900 ring-1 ring-light-300 hover:bg-light-100',
    danger: 'bg-danger text-white hover:bg-red-600',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function SpaTabs({ items, value, onChange }) {
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.5)] ring-1 ring-black/[0.05]">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-full px-2 py-2.5 text-[12px] font-semibold transition ${
              active ? 'bg-navy-900 text-white' : 'text-slate-500 hover:text-navy-900'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function SpaSheet({ children, expanded = false }) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-[1.7rem] bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.42)] ring-1 ring-black/[0.04] ${
        expanded ? 'h-full' : 'max-h-[58vh]'
      }`}
    >
      <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-light-400" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
        {children}
      </div>
    </div>
  );
}

export function SpaBackHome() {
  return (
    <Link href="/" className="shrink-0 text-[12px] font-medium text-slate-400 hover:text-navy-900">
      Inicio
    </Link>
  );
}
