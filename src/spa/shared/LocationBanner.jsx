'use client';

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-6.2 7-11.2A7 7 0 1 0 5 9.8C5 14.8 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="9.8" r="2.2" fill="currentColor" />
    </svg>
  );
}

export default function LocationBanner({
  title,
  body,
  onAllow,
}) {
  return (
    <div className="spa-banner">
      <div className="spa-banner-icon">
        <PinIcon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold tracking-tight text-navy-900">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{body}</p>
        {onAllow ? (
          <button type="button" onClick={onAllow} className="spa-banner-btn">
            Permitir ubicación
          </button>
        ) : null}
      </div>
    </div>
  );
}
