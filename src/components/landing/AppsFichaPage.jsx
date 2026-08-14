import Link from 'next/link';
import LandingLogo from './LandingLogo';

export const PLAY_PASSENGER =
  'https://play.google.com/store/apps/details?id=com.remises.passengerapp';
export const PLAY_DRIVER =
  'https://play.google.com/store/apps/details?id=com.remises.driverapp';

function PlayMark({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.609 1.814L13.792 12 3.61 22.186a1.003 1.003 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
    </svg>
  );
}

function ArrowIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function AppRow({
  href,
  title,
  subtitle,
  meta,
  tone = 'light',
  emphasized = false,
}) {
  const dark = tone === 'dark';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'group relative flex min-h-[72px] items-center gap-3.5 rounded-2xl px-4 py-4 transition-all duration-300',
        'sm:min-h-[80px] sm:gap-4 sm:rounded-[1.35rem] sm:px-5 sm:py-5',
        'active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        emphasized ? 'ring-2 ring-accent/30 ring-offset-2 ring-offset-white' : '',
        dark
          ? 'bg-navy-900 text-white shadow-[0_16px_40px_-20px_rgba(15,23,42,0.55)] hover:bg-[#1f2558]'
          : 'border border-black/[0.06] bg-white text-navy-900 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.28)] hover:border-accent/25 hover:shadow-[0_16px_40px_-18px_rgba(36,95,141,0.22)]',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl',
          dark ? 'bg-white/10 text-white' : 'bg-navy-900 text-white',
        ].join(' ')}
      >
        <PlayMark className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" />
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className={`block text-[10px] font-semibold uppercase tracking-[0.14em] sm:text-[11px] ${dark ? 'text-white/55' : 'text-slate-500'}`}>
          {meta}
        </span>
        <span className="mt-0.5 block truncate text-[15px] font-bold leading-snug tracking-tight sm:text-base">
          {title}
        </span>
        <span className={`mt-0.5 block text-[13px] leading-snug sm:text-sm ${dark ? 'text-white/65' : 'text-slate-500'}`}>
          {subtitle}
        </span>
      </span>

      <span
        className={[
          'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition sm:h-11 sm:px-4 sm:text-sm',
          dark
            ? 'bg-white text-navy-900 group-hover:bg-light-50'
            : 'bg-accent text-white group-hover:bg-accent-light',
        ].join(' ')}
      >
        Play
        <ArrowIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </span>
    </a>
  );
}

/**
 * Ficha QR: descarga de apps en Play Store.
 * @param {{ focus?: 'pasajero' | 'conductor' | null }} props
 */
export default function AppsFichaPage({ focus = null }) {
  const showPassenger = focus !== 'conductor';
  const showDriver = focus !== 'pasajero';
  const single = Boolean(focus);

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[#F7F8FB] text-navy-900">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[55vw] max-h-[420px] w-[90vw] max-w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(36,95,141,0.14)_0%,transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[-8%] right-[-10%] h-[40vw] max-h-[320px] w-[55vw] max-w-[420px] rounded-full bg-[radial-gradient(circle,rgba(40,46,105,0.1)_0%,transparent_70%)] blur-2xl" />
      </div>

      <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-[28rem] flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:max-w-xl sm:px-8 lg:max-w-2xl lg:px-10">
        <header className="flex items-center justify-between gap-3 py-3 sm:py-5">
          <Link href="/" className="min-w-0 shrink" aria-label="Ir al inicio de Profesional">
            <LandingLogo size="sm" className="sm:hidden" />
            <LandingLogo size="md" className="hidden sm:inline-flex" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-slate-600 shadow-sm ring-1 ring-black/[0.04] backdrop-blur sm:px-3 sm:text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Salta
          </span>
        </header>

        <section className="flex flex-1 flex-col justify-center py-6 sm:py-10 lg:py-14">
          <div className="landing-hero-enter mx-auto w-full max-w-md text-center lg:max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent sm:text-xs">
              Google Play
            </p>
            <h1 className="landing-hero-enter landing-hero-enter-delay-1 mt-3 text-[clamp(1.85rem,6.5vw,2.75rem)] font-extrabold leading-[1.08] tracking-tight text-navy-900">
              Profesional
            </h1>
            <p className="landing-hero-enter landing-hero-enter-delay-2 mx-auto mt-3 max-w-[22rem] text-[14px] leading-relaxed text-slate-500 sm:mt-4 sm:max-w-sm sm:text-[15px]">
              {single
                ? 'Tocá para abrir la app en Play Store.'
                : 'Elegí tu app y descargala en un toque.'}
            </p>
          </div>

          <div
            className={[
              'landing-hero-enter landing-hero-enter-delay-3 mx-auto mt-7 w-full sm:mt-9',
              single ? 'max-w-md' : 'max-w-md space-y-3 sm:space-y-3.5 lg:max-w-lg',
            ].join(' ')}
          >
            {showPassenger ? (
              <AppRow
                href={PLAY_PASSENGER}
                tone="light"
                meta="Para viajar"
                title="Pasajero"
                subtitle="Pedí tu auto y seguí el viaje en vivo"
                emphasized={focus === 'pasajero'}
              />
            ) : null}

            {showDriver ? (
              <AppRow
                href={PLAY_DRIVER}
                tone="dark"
                meta="Para conducir"
                title="Conductor"
                subtitle="Recibí viajes y gestioná tu jornada"
                emphasized={focus === 'conductor'}
              />
            ) : null}
          </div>

          {focus ? (
            <p className="mt-6 text-center text-sm text-slate-500">
              ¿Otra app?{' '}
              <Link href="/apps" className="font-semibold text-navy-900 underline-offset-4 hover:underline">
                Ver ambas
              </Link>
            </p>
          ) : (
            <p className="mt-7 text-center text-[12px] text-slate-400 sm:mt-8 sm:text-[13px]">
              Gratis en Android · Google Play
            </p>
          )}
        </section>

        <footer className="flex items-center justify-center gap-4 border-t border-black/[0.04] py-4 text-[12px] text-slate-500 sm:py-5 sm:text-[13px]">
          <Link href="/" className="transition hover:text-navy-900">
            Web
          </Link>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <Link href="/contacto" className="transition hover:text-navy-900">
            Contacto
          </Link>
        </footer>
      </main>
    </div>
  );
}
