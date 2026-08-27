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
    <div className="flex items-start gap-3 rounded-2xl bg-navy-900 px-3.5 py-3 text-white shadow-[0_12px_32px_-18px_rgba(15,23,42,0.7)]">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
        <PinIcon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-white/70">{body}</p>
        {onAllow ? (
          <button
            type="button"
            onClick={onAllow}
            className="mt-2.5 inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-[12px] font-semibold text-navy-900"
          >
            Permitir ubicación
          </button>
        ) : null}
      </div>
    </div>
  );
}
