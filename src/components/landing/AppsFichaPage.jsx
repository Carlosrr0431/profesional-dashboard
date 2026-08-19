import Link from 'next/link';
import LandingLogo from './LandingLogo';

export const PLAY_PASSENGER =
  'https://play.google.com/store/apps/details?id=com.remises.passengerapp';
export const PLAY_DRIVER =
  'https://play.google.com/store/apps/details?id=com.remises.driverapp';
export const APPLE_PASSENGER =
  'https://apps.apple.com/ar/app/profesional-pasajero/id6788189673';
export const APPLE_DRIVER =
  'https://apps.apple.com/ar/app/profesional-conductor/id6792967642';
export const WHATSAPP_PHONE_DISPLAY = '+54 9 3872 13-8777';
export const WHATSAPP_HREF =
  'https://wa.me/5493872138777?text=' + encodeURIComponent('Hola, quiero pedir un viaje');

function PlayMark({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a1.003 1.003 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
    </svg>
  );
}

function AppleMark({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.463 2.2-1.207 2.993-.807.86-2.135 1.512-3.27 1.422-.146-1.095.422-2.227 1.148-3.016.79-.86 2.156-1.49 3.329-1.4zM20.52 17.14c-.54 1.24-.8 1.79-1.5 2.89-1.03 1.55-2.48 3.48-4.28 3.5-1.6.02-2.01-1.05-4.18-1.04-2.17.01-2.62 1.06-4.22 1.04-1.8-.02-3.18-1.76-4.21-3.31C.33 16.96-.84 12.3.9 9.17c.86-1.55 2.4-2.53 4.07-2.56 1.6-.03 3.11 1.08 4.17 1.08 1.05 0 3.02-1.33 5.1-1.13.87.04 3.31.35 4.88 2.64-4.13 2.26-3.47 8.15.4 7.94z" />
    </svg>
  );
}

function PhoneMark({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3.75h8A2.25 2.25 0 0118.25 6v12A2.25 2.25 0 0116 20.25H8A2.25 2.25 0 015.75 18V6A2.25 2.25 0 018 3.75zM9.75 17.25h4.5" />
    </svg>
  );
}

function WhatsAppMark({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function StoreButton({ href, store, dark, appName }) {
  const apple = store === 'apple';
  const storeName = apple ? 'App Store' : 'Play Store';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Descargar ${appName} en ${storeName}`}
      className={[
        'inline-flex min-h-11 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition-[background-color,color,box-shadow] duration-200 sm:text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2',
        dark
          ? apple
            ? 'bg-white text-navy-900 hover:bg-light-50 focus-visible:ring-offset-navy-900'
            : 'bg-white/12 text-white ring-1 ring-white/20 hover:bg-white/18 focus-visible:ring-offset-navy-900'
          : apple
            ? 'bg-navy-900 text-white hover:bg-[#1f2558] focus-visible:ring-offset-white'
            : 'bg-accent text-white hover:bg-accent-light focus-visible:ring-offset-white',
      ].join(' ')}
    >
      {apple ? <AppleMark /> : <PlayMark />}
      {storeName}
    </a>
  );
}

function AppCard({
  title,
  subtitle,
  meta,
  playHref,
  appleHref,
  tone = 'light',
  emphasized = false,
}) {
  const dark = tone === 'dark';

  return (
    <article
      className={[
        'flex h-full min-h-0 flex-col justify-between rounded-2xl px-3.5 py-3 sm:rounded-[1.25rem] sm:px-4 sm:py-3.5',
        emphasized ? 'ring-2 ring-accent/30 ring-offset-2 ring-offset-[#F7F8FB]' : '',
        dark
          ? 'bg-navy-900 text-white shadow-[0_12px_32px_-18px_rgba(15,23,42,0.5)]'
          : 'border border-black/[0.06] bg-white text-navy-900 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.28)]',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={[
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11',
            dark ? 'bg-white/10 text-white' : 'bg-navy-900 text-white',
          ].join(' ')}
        >
          <PhoneMark />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${dark ? 'text-white/55' : 'text-slate-500'}`}>
            {meta}
          </p>
          <h2 className="truncate text-[15px] font-bold leading-tight tracking-tight sm:text-base">
            {title}
          </h2>
          <p className={`mt-0.5 line-clamp-1 text-[12px] leading-snug sm:text-[13px] ${dark ? 'text-white/65' : 'text-slate-500'} [@media(max-height:640px)]:hidden`}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <StoreButton href={playHref} store="play" dark={dark} appName={title} />
        <StoreButton href={appleHref} store="apple" dark={dark} appName={title} />
      </div>
    </article>
  );
}

function WhatsAppCard({ className = '' }) {
  return (
    <article
      className={[
        'flex h-full min-h-0 flex-col justify-between rounded-2xl border border-[#25D366]/20 bg-[linear-gradient(180deg,#F3FBF6_0%,#FFFFFF_55%)] px-3.5 py-3 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)] sm:rounded-[1.25rem] sm:px-4 sm:py-3.5',
        className,
      ].join(' ')}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white sm:h-11 sm:w-11">
          <WhatsAppMark />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#128C7E]">
            Sin descargar
          </p>
          <h2 className="text-[15px] font-bold leading-tight tracking-tight text-navy-900 sm:text-base">
            Pedí por WhatsApp
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-500 sm:text-[13px]">
            Pedí viajes, consultá precios y seguí tu auto en vivo.
          </p>
          <ul className="mt-1.5 hidden flex-wrap gap-1.5 text-[11px] font-semibold text-slate-600 min-[400px]:flex [@media(max-height:560px)]:hidden">
            {['Viajes', 'Precios', 'Seguimiento'].map((item) => (
              <li key={item} className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/[0.06]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <p
          translate="no"
          className="min-w-0 truncate text-center text-[13px] font-bold tabular-nums tracking-tight text-navy-900 sm:flex-1 sm:text-left sm:text-sm"
        >
          {WHATSAPP_PHONE_DISPLAY}
        </p>
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Escribir por WhatsApp al ${WHATSAPP_PHONE_DISPLAY}`}
          className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-4 text-xs font-bold text-white transition-[background-color,box-shadow] duration-200 hover:bg-[#1ebe57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/50 focus-visible:ring-offset-2 sm:min-w-[10.5rem] sm:text-sm"
        >
          <WhatsAppMark className="h-4 w-4" />
          Escribir ahora
        </a>
      </div>
    </article>
  );
}

/**
 * Ficha QR: descarga de apps y pedido por WhatsApp, pensada para caber en una sola pantalla.
 * @param {{ focus?: 'pasajero' | 'conductor' | null }} props
 */
export default function AppsFichaPage({ focus = null }) {
  const showPassenger = focus !== 'conductor';
  const showDriver = focus !== 'pasajero';
  const bothApps = showPassenger && showDriver;

  return (
    <div className="relative h-[100dvh] overflow-x-hidden overflow-y-auto overscroll-y-none bg-[#F7F8FB] text-navy-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-18%] h-[48vw] max-h-[280px] w-[88vw] max-w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(36,95,141,0.12)_0%,transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[-12%] right-[-12%] h-[36vw] max-h-[240px] w-[50vw] max-w-[360px] rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.12)_0%,transparent_70%)] blur-2xl" />
      </div>

      <main className="relative mx-auto flex h-full w-full max-w-6xl flex-col px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
        <header className="flex shrink-0 items-center justify-between gap-3 py-1.5 sm:py-2">
          <Link href="/" className="min-w-0 shrink touch-manipulation" aria-label="Ir al inicio de Profesional">
            <LandingLogo size="sm" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-slate-600 shadow-sm ring-1 ring-black/[0.04] backdrop-blur sm:text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Salta
          </span>
        </header>

        <section className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 py-1 sm:gap-3 sm:py-2">
          <div className="landing-hero-enter shrink-0 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent sm:text-[11px]">
              Apps y WhatsApp
            </p>
            <h1 className="landing-hero-enter landing-hero-enter-delay-1 mt-1 text-balance text-[clamp(1.35rem,4.2vh,2.15rem)] font-extrabold leading-none tracking-tight text-navy-900">
              Profesional
            </h1>
            <p className="landing-hero-enter landing-hero-enter-delay-2 mx-auto mt-1.5 max-w-md text-pretty text-[13px] leading-snug text-slate-500 sm:text-sm [@media(max-height:640px)]:hidden">
              Descargá la app o pedí tu viaje por chat. Precios, seguimiento y reservas en Salta Capital.
            </p>
          </div>

          <div
            className={[
              'landing-hero-enter landing-hero-enter-delay-3 grid min-h-0 w-full gap-2 sm:gap-2.5',
              bothApps
                ? 'grid-cols-1 min-[720px]:grid-cols-2 xl:grid-cols-3 [@media(max-height:520px)]:grid-cols-3'
                : 'grid-cols-1 min-[720px]:grid-cols-2',
            ].join(' ')}
          >
            {showPassenger ? (
              <AppCard
                playHref={PLAY_PASSENGER}
                appleHref={APPLE_PASSENGER}
                tone="light"
                meta="Para viajar"
                title="Pasajero"
                subtitle="Pedí tu auto y seguí el viaje en vivo"
                emphasized={focus === 'pasajero'}
              />
            ) : null}

            {showDriver ? (
              <AppCard
                playHref={PLAY_DRIVER}
                appleHref={APPLE_DRIVER}
                tone="dark"
                meta="Para conducir"
                title="Conductor"
                subtitle="Recibí viajes y gestioná tu jornada"
                emphasized={focus === 'conductor'}
              />
            ) : null}

            <WhatsAppCard
              className={bothApps ? 'min-[720px]:col-span-2 xl:col-span-1 [@media(max-height:520px)]:col-span-1' : ''}
            />
          </div>

          {focus ? (
            <p className="shrink-0 text-center text-[12px] text-slate-500 sm:text-sm">
              ¿Otra app?{' '}
              <Link href="/apps" className="font-semibold text-navy-900 underline-offset-4 hover:underline">
                Ver ambas
              </Link>
            </p>
          ) : null}
        </section>

        <footer className="flex shrink-0 items-center justify-center gap-4 border-t border-black/[0.04] py-1.5 text-[12px] text-slate-500 sm:py-2">
          <Link href="/" className="touch-manipulation transition-colors duration-200 hover:text-navy-900">
            Web
          </Link>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <Link href="/contacto" className="touch-manipulation transition-colors duration-200 hover:text-navy-900">
            Contacto
          </Link>
        </footer>
      </main>
    </div>
  );
}
