'use client';

import { useReveal } from './useReveal';

function Reveal({ children, className = '', delay = 0 }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`landing-reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

function ScreenshotFrame({ src, alt, className = '' }) {
  return (
    <div
      className={`group relative shrink-0 overflow-hidden rounded-[1.75rem] border border-light-300/80 bg-white shadow-[0_20px_50px_-12px_rgba(15,23,42,0.15)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_28px_60px_-12px_rgba(15,23,42,0.2)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-1 ring-inset ring-white/60" />
      <img
        src={src}
        alt={alt}
        className="block h-full w-full object-cover object-top"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

function StoreButton({ href, label, sublabel, accent = 'red' }) {
  const accentStyles =
    accent === 'green'
      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
      : 'bg-accent hover:bg-accent-light shadow-accent/25';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex w-full items-center gap-3 rounded-2xl px-5 py-3.5 text-white shadow-lg transition-all duration-300 sm:w-auto ${accentStyles}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 transition group-hover:scale-105">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.609 1.814L13.792 12 3.61 22.186a1.003 1.003 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
        </svg>
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/75">{sublabel}</span>
        <span className="block text-sm font-bold">{label}</span>
      </span>
    </a>
  );
}

export default function AppShowcase({
  id,
  variant,
  eyebrow,
  title,
  subtitle,
  features,
  href,
  banner,
  screenshots,
  reversed = false,
}) {
  const isPassenger = variant === 'passenger';
  const accent = isPassenger ? 'red' : 'green';
  const badgeClass = isPassenger
    ? 'bg-accent/10 text-accent border-accent/15'
    : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/15';
  const checkClass = isPassenger ? 'bg-accent/10 text-accent' : 'bg-emerald-500/10 text-emerald-600';
  const sectionBg = isPassenger ? 'bg-white' : 'bg-light-100/80';

  return (
    <section id={id} className={`relative overflow-hidden py-16 sm:py-24 lg:py-28 ${sectionBg}`}>
      <div
        aria-hidden
        className={`pointer-events-none absolute ${reversed ? '-left-32' : '-right-32'} top-0 h-96 w-96 rounded-full blur-[100px] ${
          isPassenger ? 'bg-accent/[0.06]' : 'bg-emerald-500/[0.07]'
        }`}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div
            className={`flex flex-col gap-10 lg:gap-16 ${
              reversed ? 'lg:flex-row-reverse' : 'lg:flex-row'
            } lg:items-center`}
          >
            <div className="flex-1">
              <span className={`inline-flex items-center rounded-full border px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${badgeClass}`}>
                {eyebrow}
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                {title}
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">{subtitle}</p>

              <ul className="mt-8 space-y-3">
                {features.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] text-slate-700">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${checkClass}`}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <StoreButton
                  href={href}
                  sublabel="Disponible en"
                  label="Google Play"
                  accent={accent}
                />
              </div>
            </div>

            <div className="flex-1">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div
                  aria-hidden
                  className={`absolute -inset-4 rounded-[2.5rem] blur-2xl ${
                    isPassenger ? 'bg-gradient-to-br from-accent/15 to-navy-700/10' : 'bg-gradient-to-br from-emerald-400/15 to-navy-700/10'
                  }`}
                />
                <ScreenshotFrame
                  src={screenshots[0].src}
                  alt={screenshots[0].alt}
                  className="relative mx-auto aspect-[9/19.5] w-[min(100%,280px)] sm:w-[300px]"
                />
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120} className="mt-12 sm:mt-16">
          <div className="overflow-hidden rounded-[1.75rem] border border-light-300/80 bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.18)]">
            <img
              src={banner.src}
              alt={banner.alt}
              className="block h-auto w-full object-cover"
              loading="lazy"
              draggable={false}
            />
          </div>
        </Reveal>

        <Reveal delay={180} className="mt-8 sm:mt-10">
          <div className="landing-screenshots-scroll flex gap-4 overflow-x-auto pb-2 pt-1 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible">
            {screenshots.slice(1).map((shot, index) => (
              <ScreenshotFrame
                key={shot.src}
                src={shot.src}
                alt={shot.alt}
                className={`aspect-[9/19.5] w-[58vw] sm:w-auto ${index === 0 ? 'sm:mt-6' : index === 2 ? 'sm:-mt-4' : ''}`}
              />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
