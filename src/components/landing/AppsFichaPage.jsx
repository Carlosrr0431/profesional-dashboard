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
export const LANDLINE_DISPLAY = '387 431-8888';
export const LANDLINE_HREF = 'tel:+543874318888';

const cardShell =
  'flex h-full min-h-0 flex-col justify-between rounded-[1.35rem] bg-white/75 p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_10px_30px_-20px_rgba(15,23,42,0.28)] ring-1 ring-black/[0.05] backdrop-blur-md sm:rounded-[1.5rem] sm:p-4';

function PlayMark({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a1.003 1.003 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
    </svg>
  );
}

function AppleMark({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.463 2.2-1.207 2.993-.807.86-2.135 1.512-3.27 1.422-.146-1.095.422-2.227 1.148-3.016.79-.86 2.156-1.49 3.329-1.4zM20.52 17.14c-.54 1.24-.8 1.79-1.5 2.89-1.03 1.55-2.48 3.48-4.28 3.5-1.6.02-2.01-1.05-4.18-1.04-2.17.01-2.62 1.06-4.22 1.04-1.8-.02-3.18-1.76-4.21-3.31C.33 16.96-.84 12.3.9 9.17c.86-1.55 2.4-2.53 4.07-2.56 1.6-.03 3.11 1.08 4.17 1.08 1.05 0 3.02-1.33 5.1-1.13.87.04 3.31.35 4.88 2.64-4.13 2.26-3.47 8.15.4 7.94z" />
    </svg>
  );
}

function PassengerMark() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.118a7.5 7.5 0 0115 0A17.93 17.93 0 0112 21.75c-2.676 0-5.216-.584-7.5-1.632z" />
    </svg>
  );
}

function DriverMark() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6.75m4.5 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-10.5-3l1.14-5.482A2.25 2.25 0 017.86 8.25h8.28a2.25 2.25 0 012.22 1.768L19.5 15.75m-15 0h15" />
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

function PhoneMark({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function StoreButton({ href, store, appName }) {
  const apple = store === 'apple';
  const storeName = apple ? 'App Store' : 'Play Store';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Descargar ${appName} en ${storeName}`}
      className={[
        'inline-flex min-h-11 min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold tracking-tight transition-[background-color,box-shadow,transform] duration-200 sm:text-[13px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2',
        apple
          ? 'bg-navy-900 text-white hover:bg-navy-800'
          : 'bg-white text-navy-900 ring-1 ring-black/[0.08] hover:bg-light-100',
      ].join(' ')}
    >
      {apple ? <AppleMark /> : <PlayMark />}
      <span className="truncate">{storeName}</span>
    </a>
  );
}

function AppCard({
  title,
  subtitle,
  meta,
  playHref,
  appleHref,
  webHref,
  webLabel,
  icon,
  iconClass,
  emphasized = false,
}) {
  return (
    <article className={`${cardShell} ${emphasized ? 'ring-2 ring-accent/25' : ''}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-11 sm:w-11 ${iconClass}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">{meta}</p>
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-navy-900 sm:text-base">{title}</h2>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] leading-snug text-slate-500 [@media(max-height:620px)]:hidden">
            {subtitle}
          </p>
        </div>
      </div>
      {webHref ? (
        <Link
          href={webHref}
          className="mt-3.5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-navy-900 px-3 text-[12px] font-semibold text-white sm:text-[13px]"
        >
          {webLabel || 'Usar en el navegador'}
        </Link>
      ) : null}
      <div className="mt-2 flex gap-2">
        <StoreButton href={playHref} store="play" appName={title} />
        <StoreButton href={appleHref} store="apple" appName={title} />
      </div>
    </article>
  );
}

function WhatsAppCard({ className = '' }) {
  return (
    <article className={`${cardShell} ${className}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#25D366]/12 text-[#128C7E] sm:h-11 sm:w-11">
          <WhatsAppMark />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Sin descargar</p>
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-navy-900 sm:text-base">
            Pedí por WhatsApp o teléfono
          </h2>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] leading-snug text-slate-500 [@media(max-height:620px)]:hidden">
            WhatsApp para mensajes. El fijo, solo llamadas.
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-2">
        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center">
          <p
            translate="no"
            className="min-w-0 truncate text-center text-[13px] font-semibold tabular-nums tracking-tight text-navy-900 min-[420px]:flex-1 min-[420px]:text-left sm:text-[14px]"
          >
            {WHATSAPP_PHONE_DISPLAY}
          </p>
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Escribir por WhatsApp al ${WHATSAPP_PHONE_DISPLAY}`}
            className="inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-4 text-[12px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-[#20c35c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/45 focus-visible:ring-offset-2 min-[420px]:min-w-[9.75rem] sm:text-[13px]"
          >
            <WhatsAppMark className="h-3.5 w-3.5" />
            Escribir ahora
          </a>
        </div>

        <div className="flex flex-col gap-2 border-t border-black/[0.05] pt-2 min-[420px]:flex-row min-[420px]:items-center">
          <div className="min-w-0 min-[420px]:flex-1">
            <p className="text-center text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 min-[420px]:text-left">
              Teléfono fijo · solo llamadas
            </p>
            <p
              translate="no"
              className="mt-0.5 truncate text-center text-[13px] font-semibold tabular-nums tracking-tight text-navy-900 min-[420px]:text-left sm:text-[14px]"
            >
              {LANDLINE_DISPLAY}
            </p>
          </div>
          <a
            href={LANDLINE_HREF}
            aria-label={`Llamar al teléfono fijo ${LANDLINE_DISPLAY}. Solo llamadas, no WhatsApp.`}
            className="inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-full bg-navy-900 px-4 text-[12px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 min-[420px]:min-w-[9.75rem] sm:text-[13px]"
          >
            <PhoneMark className="h-3.5 w-3.5" />
            Llamar
          </a>
        </div>
      </div>
    </article>
  );
}

/**
 * Ficha QR: descarga de apps, pedido por WhatsApp y llamado al fijo.
 * @param {{ focus?: 'pasajero' | 'conductor' | null }} props
 */
export default function AppsFichaPage({ focus = null }) {
  const showPassenger = focus !== 'conductor';
  const showDriver = focus !== 'pasajero';
  const bothApps = showPassenger && showDriver;

  return (
    <div className="relative h-[100dvh] overflow-x-hidden overflow-y-auto overscroll-y-none bg-[#F3F5F8] text-navy-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[42%] bg-[radial-gradient(ellipse_at_top,rgba(36,95,141,0.09),transparent_62%)]" />
        <div className="absolute bottom-[-20%] right-[-8%] h-[46%] w-[70%] bg-[radial-gradient(ellipse_at_center,rgba(37,211,102,0.07),transparent_68%)]" />
      </div>

      <main className="relative mx-auto flex h-full w-full max-w-[28rem] flex-col px-[max(1rem,4.2vw)] pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-[max(0.55rem,env(safe-area-inset-top))] sm:max-w-3xl lg:max-w-5xl">
        <header className="flex shrink-0 items-center justify-between gap-3 py-2">
          <Link href="/" className="min-w-0 shrink touch-manipulation" aria-label="Ir al inicio de Profesional">
            <LandingLogo size="sm" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-medium tracking-wide text-slate-500 ring-1 ring-black/[0.05] backdrop-blur-md sm:text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Salta
          </span>
        </header>

        <section className="flex min-h-0 flex-1 flex-col justify-center gap-3 py-1 sm:gap-4">
          <div className="landing-hero-enter shrink-0 text-center">
            <h1 className="text-balance text-[clamp(1.45rem,3.8vh,2rem)] font-semibold tracking-tight text-navy-900">
              Viajes en Salta
            </h1>
            <p className="landing-hero-enter landing-hero-enter-delay-1 mx-auto mt-1.5 max-w-[22rem] text-pretty text-[13px] leading-relaxed text-slate-500 sm:max-w-md sm:text-[14px]">
              Usá la web, descargá la app, escribí por WhatsApp o llamá al fijo.
            </p>
          </div>

          <div
            className={[
              'landing-hero-enter landing-hero-enter-delay-2 grid w-full gap-2.5 sm:gap-3',
              bothApps
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 [@media(max-height:500px)]:grid-cols-3'
                : 'grid-cols-1 sm:grid-cols-2',
            ].join(' ')}
          >
            {showPassenger ? (
              <AppCard
                playHref={PLAY_PASSENGER}
                appleHref={APPLE_PASSENGER}
                webHref="/pasajero"
                webLabel="Pedir viaje en el navegador"
                meta="Para viajar"
                title="Pasajero"
                subtitle="Pedí tu auto y seguí el viaje en vivo"
                icon={<PassengerMark />}
                iconClass="bg-accent-dim text-accent"
                emphasized={focus === 'pasajero'}
              />
            ) : null}

            {showDriver ? (
              <AppCard
                playHref={PLAY_DRIVER}
                appleHref={APPLE_DRIVER}
                webHref="/conductor"
                webLabel="Entrar como conductor"
                meta="Para conducir"
                title="Conductor"
                subtitle="Recibí viajes y gestioná tu jornada"
                icon={<DriverMark />}
                iconClass="bg-navy-dim text-navy-700"
                emphasized={focus === 'conductor'}
              />
            ) : null}

            <WhatsAppCard
              className={bothApps ? 'sm:col-span-2 lg:col-span-1 [@media(max-height:500px)]:col-span-1' : ''}
            />
          </div>

          {focus ? (
            <p className="shrink-0 text-center text-[12px] text-slate-500">
              ¿Otra app?{' '}
              <Link href="/apps" className="font-semibold text-navy-900 underline-offset-4 hover:underline">
                Ver ambas
              </Link>
            </p>
          ) : null}
        </section>

        <footer className="flex shrink-0 items-center justify-center gap-5 py-2 text-[12px] text-slate-400">
          <Link href="/" className="touch-manipulation transition-colors duration-200 hover:text-navy-900">
            Web
          </Link>
          <Link href="/contacto" className="touch-manipulation transition-colors duration-200 hover:text-navy-900">
            Contacto
          </Link>
        </footer>
      </main>
    </div>
  );
}
