'use client';

import DashboardBrand from './DashboardBrand';

/**
 * Splash del dashboard: marca nítida (isotipo + wordmark) sobre el mismo navy del login.
 */
export default function DashboardLoadingScreen({
  message = 'Cargando operaciones…',
  fullScreen = true,
}) {
  return (
    <div
      className={`${
        fullScreen ? 'h-screen min-h-dvh' : 'min-h-[50vh]'
      } relative flex items-center justify-center overflow-hidden bg-[#0a1220]`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_38%,rgba(59,94,140,0.38),transparent_62%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_100%,rgba(0,0,0,0.45),transparent_70%)]"
      />

      <div className="relative z-10 flex flex-col items-center px-6">
        <div className="relative mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center">
          <span
            aria-hidden
            className="dash-load-ring pointer-events-none absolute inset-[-8px] rounded-full"
          />
          <DashboardBrand
            src="/logo-mark.svg?v=2"
            className="justify-center"
            imageClassName="h-11 w-11 object-contain"
          />
        </div>

        <p className="text-[28px] font-semibold leading-none tracking-tight text-white sm:text-[32px]">
          Profesional
        </p>

        <div className="mt-8 h-[2px] w-40 overflow-hidden rounded-full bg-white/10">
          <div className="dash-load-bar h-full w-1/2 rounded-full bg-white/80" />
        </div>

        <p className="mt-4 text-[13px] font-medium text-white/50">
          {message}
        </p>
      </div>

      <style>{`
        .dash-load-ring {
          background: conic-gradient(from 0deg, transparent 0 62%, rgba(255,255,255,0.55) 78%, transparent 100%);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1.5px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1.5px));
          animation: dashLoadSpin 1.15s linear infinite;
        }
        .dash-load-bar {
          animation: dashLoadBar 1.2s ease-in-out infinite;
        }
        @keyframes dashLoadSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes dashLoadBar {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(240%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .dash-load-ring,
          .dash-load-bar { animation: none; }
          .dash-load-ring { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
