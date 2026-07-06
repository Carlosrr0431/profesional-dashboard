'use client';

/** Duración compartida con `.landing-hero-progress` en globals.css */
const TRIP_DURATION = '8s';

/** Ruta solo por calles (intersecciones del grid del mapa). */
const ROUTE_PATH = 'M 52 282 L 52 222 L 212 222 L 212 102 L 292 102 L 292 42';
const ORIGIN = { x: 52, y: 282 };
const DEST = { x: 292, y: 42 };

function DriverEtaCard() {
  return (
    <div className="rounded-lg border border-white/90 bg-white/95 px-2 py-1.5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.18)] backdrop-blur-sm sm:rounded-xl sm:px-2.5 sm:py-2">
      <p className="text-[10px] font-bold leading-tight text-navy-900 sm:text-[11px]">Chofer en camino</p>
      <p className="mt-0.5 text-[9px] text-slate-500 sm:text-[10px]">Llegada · 4 min</p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-light-200">
        <div className="landing-hero-progress h-full rounded-full bg-gradient-to-r from-[#282e69] via-[#245f8d] to-[#3480b8]" />
      </div>
    </div>
  );
}

/** Auto visto desde arriba — orientado hacia +X para animateMotion rotate="auto". */
function MapCarIcon() {
  return (
    <g transform="translate(-20, -11)">
      <ellipse cx="20" cy="11" rx="15" ry="9" fill="rgba(15,23,42,0.12)" />
      <path
        d="M 5 7.5 Q 5 5 8.5 4.5 L 28 4 Q 32 4 33 6.5 L 34.5 9.5 Q 35.5 11 34.5 12.5 L 33 15.5 Q 32 18 28 18 L 8.5 17.5 Q 5 17 5 14.5 L 4 12 Q 3 11 4 9.5 Z"
        fill="#245f8d"
        stroke="#1e293b"
        strokeWidth="0.9"
      />
      <path d="M 10 6 L 18.5 5.5 L 17.5 10 L 11 10.2 Z" fill="#bfdbfe" stroke="#93c5fd" strokeWidth="0.4" />
      <path d="M 20 5.5 L 29 5 L 28 9.8 L 20.5 10 Z" fill="#64748b" opacity="0.55" />
      <path d="M 8 10.5 H 31" stroke="#1e3a5f" strokeWidth="0.5" opacity="0.25" />
      <rect x="6.5" y="2.5" width="5" height="3.2" rx="1.2" fill="#0f172a" />
      <rect x="6.5" y="16.3" width="5" height="3.2" rx="1.2" fill="#0f172a" />
      <rect x="28.5" y="2.5" width="5" height="3.2" rx="1.2" fill="#0f172a" />
      <rect x="28.5" y="16.3" width="5" height="3.2" rx="1.2" fill="#0f172a" />
      <circle cx="9" cy="4.1" r="1" fill="#cbd5e1" />
      <circle cx="9" cy="17.9" r="1" fill="#cbd5e1" />
      <circle cx="31" cy="4.1" r="1" fill="#cbd5e1" />
      <circle cx="31" cy="17.9" r="1" fill="#cbd5e1" />
      <rect x="33.5" y="7" width="2.2" height="2.8" rx="0.6" fill="#fde047" />
      <rect x="33.5" y="12.2" width="2.2" height="2.8" rx="0.6" fill="#fde047" />
      <rect x="4.2" y="7.2" width="1.8" height="2.2" rx="0.4" fill="#f87171" />
      <rect x="4.2" y="12.6" width="1.8" height="2.2" rx="0.4" fill="#f87171" />
      <ellipse cx="12" cy="4.8" rx="1.2" ry="0.8" fill="#245f8d" stroke="#1e293b" strokeWidth="0.4" />
      <ellipse cx="12" cy="17.2" rx="1.2" ry="0.8" fill="#245f8d" stroke="#1e293b" strokeWidth="0.4" />
    </g>
  );
}

/** Mapa estilizado del hero: calles, manzanas, ruta animada y auto en movimiento. */
export default function HeroMapRoute() {
  return (
    <div className="landing-hero-map landing-hero-enter landing-hero-enter-delay-2 relative mx-auto w-full max-w-full sm:max-w-[440px] lg:mx-0 lg:max-w-none">
      <div className="landing-hero-map-float relative overflow-hidden rounded-[1.25rem] border border-light-300/80 bg-white/90 shadow-[0_24px_60px_-20px_rgba(36,95,141,0.25)] backdrop-blur-md sm:rounded-[2rem] sm:shadow-[0_32px_80px_-24px_rgba(36,95,141,0.28)]">
        <div className="flex items-center justify-between gap-2 border-b border-light-300/70 bg-light-100/60 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 landing-hero-live-dot" />
            <span className="truncate text-[11px] font-semibold text-navy-900 sm:text-xs">Viaje en curso</span>
          </div>
          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent sm:px-2.5 sm:py-1 sm:text-[10px]">
            Salta
          </span>
        </div>

        <div className="relative aspect-[5/4] w-full max-w-full bg-[#e8edf4]">
          {/* ETA compacta — esquina superior izquierda del mapa */}
          <div className="landing-hero-eta absolute left-2 top-2 z-10 w-[max(42%,9.5rem)] max-w-[148px] sm:left-3 sm:top-3 sm:max-w-[158px]">
            <DriverEtaCard />
          </div>

          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 320"
            fill="none"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            <defs>
              <linearGradient id="landing-route-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#282e69" />
                <stop offset="50%" stopColor="#245f8d" />
                <stop offset="100%" stopColor="#3480b8" />
              </linearGradient>
              <filter id="landing-route-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="landing-car-shadow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.4" />
              </filter>
            </defs>

            <rect width="400" height="320" fill="#e8edf4" />

            {[
              [8, 8, 44, 34], [58, 8, 74, 34], [138, 8, 74, 34], [218, 8, 74, 34], [298, 8, 94, 34],
              [8, 48, 44, 54], [58, 48, 74, 54], [138, 48, 74, 54], [218, 48, 74, 54], [298, 48, 94, 54],
              [8, 108, 44, 54], [58, 108, 74, 54], [138, 108, 74, 54], [218, 108, 74, 54], [298, 108, 94, 54],
              [8, 168, 44, 54], [58, 168, 74, 54], [138, 168, 74, 54], [218, 168, 74, 54], [298, 168, 94, 54],
              [8, 228, 44, 34], [58, 228, 74, 34], [138, 228, 74, 34], [218, 228, 74, 34], [298, 228, 94, 34],
              [8, 268, 44, 44], [58, 268, 74, 44], [138, 268, 74, 44], [218, 268, 74, 44], [298, 268, 94, 44],
            ].map(([x, y, w, h], i) => (
              <rect key={`block-${i}`} x={x} y={y} width={w} height={h} rx={3} fill="#dce4ee" stroke="#cdd7e4" strokeWidth="0.75" />
            ))}

            <rect x="142" y="112" width="66" height="46" rx="6" fill="#d4e8dc" stroke="#b8d4c4" strokeWidth="0.75" />
            <rect x="62" y="232" width="62" height="28" rx="5" fill="#d4e8dc" stroke="#b8d4c4" strokeWidth="0.75" />

            <path d="M0 42 H400 M0 102 H400 M0 162 H400 M0 222 H400 M0 282 H400" stroke="#f8fafc" strokeWidth="14" strokeLinecap="square" />
            <path d="M52 0 V320 M132 0 V320 M212 0 V320 M292 0 V320 M372 0 V320" stroke="#f8fafc" strokeWidth="14" strokeLinecap="square" />
            <path d="M0 72 H400 M0 132 H400 M0 192 H400 M0 252 H400" stroke="#f1f5f9" strokeWidth="8" />
            <path d="M92 0 V320 M172 0 V320 M252 0 V320 M332 0 V320" stroke="#f1f5f9" strokeWidth="8" />
            <path d="M0 42 H400 M0 102 H400 M0 162 H400 M0 222 H400" stroke="rgba(148,163,184,0.35)" strokeWidth="1" strokeDasharray="6 10" />
            <path d="M52 0 V320 M132 0 V320 M212 0 V320 M292 0 V320" stroke="rgba(148,163,184,0.35)" strokeWidth="1" strokeDasharray="6 10" />

            <path
              d={ROUTE_PATH}
              stroke="rgba(36, 95, 141, 0.12)"
              strokeWidth="12"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            <path
              id="landing-hero-route"
              className="landing-hero-route-path"
              d={ROUTE_PATH}
              stroke="url(#landing-route-gradient)"
              strokeWidth="5"
              strokeLinejoin="round"
              strokeLinecap="round"
              filter="url(#landing-route-glow)"
            />

            <g className="landing-hero-pin landing-hero-pin-origin">
              <circle cx={ORIGIN.x} cy={ORIGIN.y} r="14" fill="rgba(36, 95, 141, 0.12)" />
              <circle cx={ORIGIN.x} cy={ORIGIN.y} r="7" fill="#245f8d" stroke="#fff" strokeWidth="2.5" />
            </g>

            <g className="landing-hero-pin landing-hero-pin-dest">
              <circle cx={DEST.x} cy={DEST.y} r="14" fill="rgba(52, 128, 184, 0.14)" />
              <circle cx={DEST.x} cy={DEST.y} r="7" fill="#282e69" stroke="#fff" strokeWidth="2.5" />
            </g>

            <g filter="url(#landing-car-shadow)">
              <g>
                <animateMotion
                  dur={TRIP_DURATION}
                  repeatCount="indefinite"
                  calcMode="linear"
                  rotate="auto"
                >
                  <mpath href="#landing-hero-route" />
                </animateMotion>
                <MapCarIcon />
              </g>
            </g>
          </svg>
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-accent/15 via-transparent to-[#282e69]/10 blur-2xl sm:-inset-4 sm:rounded-[2.5rem]"
      />
    </div>
  );
}
