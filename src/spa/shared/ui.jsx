'use client';

import Link from 'next/link';

export const spaFieldClass =
  'spa-field h-12 w-full rounded-2xl border-0 bg-light-100 px-4 text-base font-medium text-navy-900 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-navy-900/15 disabled:bg-light-200 disabled:text-slate-500';

export function haptic(ms = 12) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Safari iOS antiguo y escritorio no soportan vibrate.
  }
}

function Icon({ name, className = 'h-[18px] w-[18px]' }) {
  const common = { viewBox: '0 0 24 24', className, fill: 'none', 'aria-hidden': true };
  if (name === 'map') {
    return (
      <svg {...common}>
        <path d="M9 4.5 3.8 6.4A1 1 0 0 0 3 7.35v11.2a1 1 0 0 0 1.32.95L9 17.8l6 1.7 5.2-1.9A1 1 0 0 0 21 16.65V5.45a1 1 0 0 0-1.32-.95L15 6.2 9 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 4.5v13.3M15 6.2v13.3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v4.2l2.6 1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'user') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8.2" r="3.1" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.4 18.6c1.4-2.7 3.7-4 6.6-4s5.2 1.3 6.6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="M4.5 11.2 12 5l7.5 6.2V19a1 1 0 0 1-1 1h-4.2v-5.2h-4.6V20H5.5a1 1 0 0 1-1-1v-7.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'chat') {
    return (
      <svg {...common}>
        <path d="M6 17.5 4.6 20.4A.6.6 0 0 0 5.5 21h9.7A4.8 4.8 0 0 0 20 16.2V9.8A4.8 4.8 0 0 0 15.2 5H8.8A4.8 4.8 0 0 0 4 9.8v5.2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'share') {
    return (
      <svg {...common}>
        <circle cx="18" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="6" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="18" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 11.2 16 7.2M8 12.8 16 16.8" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === 'close') {
    return (
      <svg {...common}>
        <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'phone') {
    return (
      <svg {...common}>
        <path d="M8.2 4.8c.5-.5 1.4-.4 1.8.2l1.3 2.1c.3.5.2 1.2-.3 1.6l-1 1a12.4 12.4 0 0 0 4.5 4.5l1-1c.4-.5 1.1-.6 1.6-.3l2.1 1.3c.6.4.7 1.3.2 1.8l-1.3 1.4c-.5.5-1.3.7-2 .4C10.5 16.4 7.6 13.5 5.2 8.2c-.3-.7-.1-1.5.4-2L8.2 4.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'sos') {
    return (
      <svg {...common}>
        <path d="M12 4.8 20.2 19H3.8L12 4.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 10v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.6" r=".8" fill="currentColor" />
      </svg>
    );
  }
  return null;
}

export function SpaIcon({ name, className = 'h-[18px] w-[18px]' }) {
  return <Icon name={name} className={className} />;
}

export function SpaBrand({ subtitle }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="spa-mark">P</div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-tight tracking-tight text-navy-900">Profesional</p>
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
    <p className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${tones[tone] || tones.info}`}>
      {children}
    </p>
  );
}

export function SpaButton({ children, onClick, disabled, variant = 'primary', type = 'button', className = '' }) {
  const variants = {
    primary: 'bg-navy-900 text-white hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900/30 focus-visible:ring-offset-2',
    accent: 'bg-accent text-white hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2',
    ghost: 'bg-light-100 text-navy-900 hover:bg-light-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900/20 focus-visible:ring-offset-2',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2',
    success: 'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={(event) => {
        if (disabled) return;
        haptic(8);
        onClick?.(event);
      }}
      className={`spa-press inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-4 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function SpaTabs({ items, value, onChange, compact = false }) {
  return (
    <nav className={compact ? 'spa-tabs spa-tabs--compact' : 'spa-tabs'} aria-label="Secciones">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === value) return;
              haptic(8);
              onChange(item.id);
            }}
            className={`spa-tab ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon ? <Icon name={item.icon} /> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function SpaSheet({ children, expanded = false, compact = false, offer = false, review = false }) {
  const cls = ['spa-sheet'];
  if (expanded) cls.push('spa-sheet--expanded');
  if (compact) cls.push('spa-sheet--compact');
  if (offer) cls.push('spa-sheet--offer');
  if (review) cls.push('spa-sheet--review');
  return (
    <div className={cls.join(' ')}>
      <div className="spa-sheet-handle" />
      <div className="spa-sheet-body">
        {children}
      </div>
    </div>
  );
}

export function SpaBackHome() {
  return (
    <Link
      href="/"
      className="spa-icon-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900/20 focus-visible:ring-offset-2"
    >
      Inicio
    </Link>
  );
}

export function SpaSwitch({ on, onClick, disabled, labelOn = 'En línea', labelOff = 'Desconectado', compact = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? labelOn : labelOff}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        haptic(on ? 8 : 16);
        onClick?.();
      }}
      className={`spa-switch ${on ? 'is-on' : ''} ${compact ? 'is-compact' : ''}`}
    >
      <span className="spa-switch-track">
        <span className="spa-switch-knob" />
      </span>
      {compact ? null : <span className="spa-switch-label">{on ? labelOn : labelOff}</span>}
    </button>
  );
}

export function SpaKicker({ live = false, children }) {
  return (
    <p className="spa-kicker">
      {live ? <span className="spa-pulse" aria-hidden="true" /> : null}
      {children}
    </p>
  );
}

export function SpaPanel({ children, className = '' }) {
  return (
    <div className={`spa-panel ${className}`.trim()}>
      {children}
    </div>
  );
}

export function SpaTripRow({ kicker, title, subtitle, meta }) {
  return (
    <article className="spa-row">
      <div className="min-w-0 flex-1">
        {kicker ? <p className="spa-kicker">{kicker}</p> : null}
        <p className="truncate text-[15px] font-semibold text-navy-900">{title}</p>
        {subtitle ? <p className="mt-0.5 truncate text-[13px] text-slate-500">{subtitle}</p> : null}
      </div>
      {meta ? <p className="shrink-0 pl-3 text-[13px] font-semibold text-navy-900">{meta}</p> : null}
    </article>
  );
}

export function SpaEmpty({ children }) {
  return <p className="px-1 py-6 text-center text-sm text-slate-500">{children}</p>;
}
