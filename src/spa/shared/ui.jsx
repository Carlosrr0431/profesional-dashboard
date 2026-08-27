'use client';

import Link from 'next/link';

export function SpaBrand({ subtitle }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-navy-900 text-white">
        <span className="text-sm font-extrabold tracking-tight">P</span>
      </div>
      <div>
        <p className="text-sm font-bold text-navy-900">Profesional</p>
        <p className="text-[11px] font-medium text-slate-500">{subtitle}</p>
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
    <nav className="grid grid-cols-3 gap-1 rounded-[1.4rem] bg-white/90 p-1 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04] backdrop-blur">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-[1.1rem] px-2 py-2.5 text-[12px] font-semibold transition ${
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

export function SpaBackHome() {
  return (
    <Link href="/" className="text-[12px] font-medium text-slate-500 hover:text-navy-900">
      Volver al inicio
    </Link>
  );
}
