'use client';

import DashboardBrand from './DashboardBrand';

/**
 * Pantalla de carga del dashboard: minimalista, centrada y con marca.
 */
export default function DashboardLoadingScreen({
  message = 'Cargando operaciones…',
  fullScreen = true,
}) {
  return (
    <div
      className={`${
        fullScreen ? 'h-screen min-h-dvh' : 'min-h-[50vh]'
      } relative flex items-center justify-center overflow-hidden bg-[#f6f7fa]`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Atmósfera suave */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 42%, rgba(37, 99, 235, 0.07) 0%, transparent 60%), linear-gradient(180deg, #fbfcfe 0%, #eef1f6 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[38%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: 'rgba(15, 23, 42, 0.04)' }}
      />

      <div className="relative z-10 flex w-full max-w-[280px] flex-col items-center px-6">
        {/* Marca con halo sutil */}
        <div className="relative mb-8 flex items-center justify-center">
          <div
            className="absolute inset-[-18px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, transparent 70%)',
              animation: 'dashLoadPulse 2.4s ease-in-out infinite',
            }}
          />
          <div
            className="relative"
            style={{ animation: 'dashLoadFloat 2.8s ease-in-out infinite' }}
          >
            <DashboardBrand
              className="justify-center"
              imageClassName="h-11 w-auto max-w-[168px] object-contain drop-shadow-sm"
            />
          </div>
        </div>

        {/* Barra de progreso fina */}
        <div className="mb-4 h-[2px] w-28 overflow-hidden rounded-full bg-navy-900/8">
          <div
            className="h-full w-1/2 rounded-full bg-navy-900/70"
            style={{ animation: 'dashLoadBar 1.15s ease-in-out infinite' }}
          />
        </div>

        <p className="text-[11px] font-medium tracking-[0.18em] text-navy-900/35 uppercase">
          {message}
        </p>
      </div>

      <style>{`
        @keyframes dashLoadPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes dashLoadFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes dashLoadBar {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(240%); }
        }
      `}</style>
    </div>
  );
}
