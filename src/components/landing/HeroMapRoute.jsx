'use client';

/** Mapa estilizado del hero: ruta animada, pins y vehículo en movimiento. */
export default function HeroMapRoute() {
  return (
    <div className="landing-hero-map landing-hero-enter landing-hero-enter-delay-2 relative mx-auto w-full max-w-[440px] lg:mx-0 lg:max-w-none">
      <div className="landing-hero-map-float relative overflow-hidden rounded-[1.75rem] border border-light-300/80 bg-white/90 shadow-[0_32px_80px_-24px_rgba(36,95,141,0.28)] backdrop-blur-md sm:rounded-[2rem]">
        <div className="flex items-center justify-between border-b border-light-300/70 bg-light-100/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 landing-hero-live-dot" />
            <span className="text-xs font-semibold text-navy-900">Viaje en curso</span>
          </div>
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">
            Salta Capital
          </span>
        </div>

        <div className="relative aspect-[5/4] w-full bg-gradient-to-br from-[#eef4fa] via-[#f8fafc] to-[#e8eef8]">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 320"
            fill="none"
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
            </defs>

            {/* Cuadras abstractas */}
            {[
              [28, 48, 52, 36], [92, 36, 44, 28], [148, 58, 38, 42], [210, 42, 48, 34],
              [278, 68, 40, 38], [48, 118, 56, 32], [118, 132, 42, 40], [188, 108, 50, 36],
              [262, 138, 44, 44], [320, 112, 36, 32], [36, 198, 48, 40], [108, 210, 40, 36],
              [172, 188, 52, 38], [248, 208, 46, 34], [310, 188, 42, 42],
            ].map(([x, y, w, h], i) => (
              <rect
                key={i}
                x={x}
                y={y}
                width={w}
                height={h}
                rx={8}
                fill="rgba(36, 95, 141, 0.07)"
                stroke="rgba(36, 95, 141, 0.08)"
                strokeWidth="1"
              />
            ))}

            {/* Calles */}
            <path d="M0 160 H400 M200 0 V320 M0 80 H400 M0 240 H400" stroke="rgba(148,163,184,0.25)" strokeWidth="2" />
            <path d="M80 0 V320 M320 0 V320" stroke="rgba(148,163,184,0.18)" strokeWidth="1.5" strokeDasharray="6 8" />

            {/* Ruta base */}
            <path
              d="M 58 252 C 95 228, 118 205, 145 188 S 205 145, 248 118 S 295 88, 338 62"
              stroke="rgba(36, 95, 141, 0.15)"
              strokeWidth="10"
              strokeLinecap="round"
            />

            {/* Ruta activa animada */}
            <path
              id="landing-hero-route"
              className="landing-hero-route-path"
              d="M 58 252 C 95 228, 118 205, 145 188 S 205 145, 248 118 S 295 88, 338 62"
              stroke="url(#landing-route-gradient)"
              strokeWidth="5"
              strokeLinecap="round"
              filter="url(#landing-route-glow)"
            />

            {/* Origen */}
            <g className="landing-hero-pin landing-hero-pin-origin">
              <circle cx="58" cy="252" r="14" fill="rgba(36, 95, 141, 0.12)" />
              <circle cx="58" cy="252" r="7" fill="#245f8d" stroke="#fff" strokeWidth="2.5" />
            </g>

            {/* Destino */}
            <g className="landing-hero-pin landing-hero-pin-dest">
              <circle cx="338" cy="62" r="14" fill="rgba(52, 128, 184, 0.14)" />
              <circle cx="338" cy="62" r="7" fill="#282e69" stroke="#fff" strokeWidth="2.5" />
            </g>

            {/* Vehículo sobre la ruta */}
            <g filter="url(#landing-route-glow)">
              <circle r="9" fill="#282e69" stroke="#fff" strokeWidth="2.5">
                <animateMotion dur="5s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.42 0 0.58 1">
                  <mpath href="#landing-hero-route" />
                </animateMotion>
              </circle>
            </g>
          </svg>

          {/* Tarjeta ETA flotante */}
          <div className="landing-hero-eta absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[210px]">
            <div className="rounded-2xl border border-white/80 bg-white/95 px-3.5 py-3 shadow-lg backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-navy-900">Chofer en camino</p>
                  <p className="text-[10px] text-slate-500">Llegada · 4 min</p>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-light-200">
                <div className="landing-hero-progress h-full rounded-full bg-gradient-to-r from-[#282e69] via-[#245f8d] to-[#3480b8]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-accent/15 via-transparent to-[#282e69]/10 blur-2xl"
      />
    </div>
  );
}
