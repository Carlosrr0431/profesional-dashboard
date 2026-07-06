'use client';

/** Duración compartida con `.landing-hero-progress` en globals.css */
const TRIP_DURATION = '8s';

function DriverEtaCard({ compact = false }) {
  return (
    <div
      className={`rounded-xl border border-white/80 bg-white/95 shadow-lg backdrop-blur-sm sm:rounded-2xl ${
        compact ? 'px-3 py-2' : 'px-3 py-2.5 sm:px-3.5 sm:py-3'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent sm:rounded-xl ${
            compact ? 'h-6 w-6' : 'h-7 w-7 sm:h-8 sm:w-8'
          }`}
        >
          <svg className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5 sm:h-4 sm:w-4'} fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-bold text-navy-900 ${compact ? 'text-[11px]' : 'text-[11px] sm:text-xs'}`}>
            Chofer en camino
          </p>
          <p className="text-[10px] text-slate-500">Llegada · 4 min</p>
        </div>
      </div>
      <div className={`overflow-hidden rounded-full bg-light-200 ${compact ? 'mt-1.5 h-1' : 'mt-2 h-1.5 sm:mt-2.5'}`}>
        <div className="landing-hero-progress h-full rounded-full bg-gradient-to-r from-[#282e69] via-[#245f8d] to-[#3480b8]" />
      </div>
    </div>
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
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 320"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
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
              <filter id="landing-car-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#1e293b" floodOpacity="0.35" />
              </filter>
            </defs>

            {/* Fondo base */}
            <rect width="400" height="320" fill="#e8edf4" />

            {/* Manzanas (bloques entre calles) */}
            {[
              [8, 8, 44, 34], [58, 8, 74, 34], [138, 8, 74, 34], [218, 8, 74, 34], [298, 8, 94, 34],
              [8, 48, 44, 54], [58, 48, 74, 54], [138, 48, 74, 54], [218, 48, 74, 54], [298, 48, 94, 54],
              [8, 108, 44, 54], [58, 108, 74, 54], [138, 108, 74, 54], [218, 108, 74, 54], [298, 108, 94, 54],
              [8, 168, 44, 54], [58, 168, 74, 54], [138, 168, 74, 54], [218, 168, 74, 54], [298, 168, 94, 54],
              [8, 228, 44, 34], [58, 228, 74, 34], [138, 228, 74, 34], [218, 228, 74, 34], [298, 228, 94, 34],
              [8, 268, 44, 44], [58, 268, 74, 44], [138, 268, 74, 44], [218, 268, 74, 44], [298, 268, 94, 44],
            ].map(([x, y, w, h], i) => (
              <rect
                key={`block-${i}`}
                x={x}
                y={y}
                width={w}
                height={h}
                rx={3}
                fill="#dce4ee"
                stroke="#cdd7e4"
                strokeWidth="0.75"
              />
            ))}

            {/* Plazas / espacios verdes */}
            <rect x="142" y="112" width="66" height="46" rx="6" fill="#d4e8dc" stroke="#b8d4c4" strokeWidth="0.75" />
            <rect x="62" y="232" width="62" height="28" rx="5" fill="#d4e8dc" stroke="#b8d4c4" strokeWidth="0.75" />

            {/* Calles principales (más anchas) */}
            <path d="M0 42 H400 M0 102 H400 M0 162 H400 M0 222 H400 M0 282 H400" stroke="#f8fafc" strokeWidth="14" strokeLinecap="square" />
            <path d="M52 0 V320 M132 0 V320 M212 0 V320 M292 0 V320 M372 0 V320" stroke="#f8fafc" strokeWidth="14" strokeLinecap="square" />

            {/* Calles secundarias */}
            <path d="M0 72 H400 M0 132 H400 M0 192 H400 M0 252 H400" stroke="#f1f5f9" strokeWidth="8" />
            <path d="M92 0 V320 M172 0 V320 M252 0 V320 M332 0 V320" stroke="#f1f5f9" strokeWidth="8" />

            {/* Marcas de calle / líneas centrales punteadas */}
            <path d="M0 42 H400 M0 102 H400 M0 162 H400 M0 222 H400" stroke="rgba(148,163,184,0.35)" strokeWidth="1" strokeDasharray="6 10" />
            <path d="M52 0 V320 M132 0 V320 M212 0 V320 M292 0 V320" stroke="rgba(148,163,184,0.35)" strokeWidth="1" strokeDasharray="6 10" />

            {/* Ruta sobre calles: origen abajo-izq → destino arriba-der */}
            <path
              d="M 72 262 L 212 262 L 212 162 L 312 162 L 312 72"
              stroke="rgba(36, 95, 141, 0.12)"
              strokeWidth="12"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            <path
              id="landing-hero-route"
              className="landing-hero-route-path"
              d="M 72 262 L 212 262 L 212 162 L 312 162 L 312 72"
              stroke="url(#landing-route-gradient)"
              strokeWidth="5"
              strokeLinejoin="round"
              strokeLinecap="round"
              filter="url(#landing-route-glow)"
            />

            {/* Pin origen */}
            <g className="landing-hero-pin landing-hero-pin-origin">
              <circle cx="72" cy="262" r="14" fill="rgba(36, 95, 141, 0.12)" />
              <circle cx="72" cy="262" r="7" fill="#245f8d" stroke="#fff" strokeWidth="2.5" />
            </g>

            {/* Pin destino */}
            <g className="landing-hero-pin landing-hero-pin-dest">
              <circle cx="312" cy="72" r="14" fill="rgba(52, 128, 184, 0.14)" />
              <circle cx="312" cy="72" r="7" fill="#282e69" stroke="#fff" strokeWidth="2.5" />
            </g>

            {/* Auto en movimiento — sincronizado con barra de progreso (8s) */}
            <g filter="url(#landing-car-shadow)">
              <g>
                <animateMotion
                  dur={TRIP_DURATION}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.42 0 0.58 1"
                  rotate="auto"
                >
                  <mpath href="#landing-hero-route" />
                </animateMotion>
                <g transform="translate(-11, -16) scale(0.9)">
                  <rect x="4" y="6" width="14" height="22" rx="4" fill="#282e69" />
                  <rect x="6" y="8" width="10" height="7" rx="2" fill="#3480b8" opacity="0.85" />
                  <rect x="6" y="19" width="10" height="5" rx="1.5" fill="#245f8d" opacity="0.7" />
                  <circle cx="3" cy="11" r="2.2" fill="#1e293b" />
                  <circle cx="19" cy="11" r="2.2" fill="#1e293b" />
                  <circle cx="3" cy="23" r="2.2" fill="#1e293b" />
                  <circle cx="19" cy="23" r="2.2" fill="#1e293b" />
                  <rect x="7" y="4" width="8" height="2" rx="1" fill="#fbbf24" opacity="0.9" />
                </g>
              </g>
            </g>
          </svg>

          {/* Desktop/tablet: tarjeta superpuesta abajo del mapa */}
          <div className="landing-hero-eta absolute bottom-4 left-4 right-4 hidden sm:block">
            <DriverEtaCard />
          </div>
        </div>

        {/* Mobile: tarjeta debajo del mapa para no tapar origen ni ruta */}
        <div className="landing-hero-eta border-t border-light-300/70 bg-light-100/60 px-3 py-2.5 sm:hidden">
          <DriverEtaCard compact />
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-accent/15 via-transparent to-[#282e69]/10 blur-2xl sm:-inset-4 sm:rounded-[2.5rem]"
      />
    </div>
  );
}
