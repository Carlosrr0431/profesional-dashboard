'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useReveal } from './useReveal';
import LandingNav from './LandingNav';
import AppShowcase from './AppShowcase';
import HeroMapRoute from './HeroMapRoute';

const PLAY_PASSENGER = 'https://play.google.com/store/apps/details?id=com.remises.passengerapp';
const PLAY_DRIVER = 'https://play.google.com/store/apps/details?id=com.remises.driverapp';

const PHONE_IMAGE = { width: 780, height: 1387 };
const BANNER_IMAGE = { width: 1280, height: 625 };

const PASSENGER_SCREENSHOTS = [
  { src: '/landing/optimized/passenger-1.webp', alt: 'Pantalla principal de la app Profesional Pasajero', ...PHONE_IMAGE },
  { src: '/landing/optimized/passenger-2.webp', alt: 'Pedir un viaje en la app de pasajeros', ...PHONE_IMAGE },
  { src: '/landing/optimized/passenger-3.webp', alt: 'Seguimiento del chofer en tiempo real', ...PHONE_IMAGE },
  { src: '/landing/optimized/passenger-4.webp', alt: 'Detalle del viaje en curso', ...PHONE_IMAGE },
];

const DRIVER_SCREENSHOTS = [
  { src: '/landing/optimized/driver-1.webp', alt: 'Inicio de sesión app Profesional Conductor', ...PHONE_IMAGE },
  { src: '/landing/optimized/driver-2.webp', alt: 'Conductor en línea recibiendo viajes', ...PHONE_IMAGE },
  { src: '/landing/optimized/driver-3.webp', alt: 'Navegación guiada hasta el destino', ...PHONE_IMAGE },
  { src: '/landing/optimized/driver-4.webp', alt: 'Gestión de viajes del conductor', ...PHONE_IMAGE },
];

const STATS = [
  { value: 'Salta', label: 'Capital' },
  { value: '24/7', label: 'Disponible' },
  { value: 'Live', label: 'Tiempo real' },
  { value: 'WhatsApp', label: 'Reservas' },
];

const PLATFORM_FEATURES = [
  {
    title: 'Mapa en vivo',
    desc: 'Ubicación de choferes y pasajeros actualizada al instante.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  {
    title: 'Asignación inteligente',
    desc: 'El viaje llega al conductor más cercano y disponible.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: 'WhatsApp integrado',
    desc: 'Reservas y confirmaciones sin salir del chat.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    title: 'Seguridad primero',
    desc: 'Choferes verificados y trazabilidad de cada viaje.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: 'Tarifas claras',
    desc: 'Precio estimado antes de confirmar el viaje.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Operaciones centralizadas',
    desc: 'Panel web para despachar, monitorear y gestionar la flota.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
];

function RevealSection({ children, className = '', delay = 0 }) {
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

function HeroStoreButton({ href, label, sublabel, variant = 'passenger' }) {
  const isPassenger = variant === 'passenger';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex w-full min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-3.5 transition-all duration-300 sm:min-h-0 sm:w-auto ${
        isPassenger
          ? 'border-light-300 bg-white text-navy-900 shadow-[0_8px_30px_-8px_rgba(15,23,42,0.12)] hover:border-accent/25 hover:shadow-[0_12px_40px_-8px_rgba(36,95,141,0.18)]'
          : 'border-navy-700/10 bg-navy-900 text-white shadow-[0_8px_30px_-8px_rgba(15,23,42,0.25)] hover:bg-navy-800'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${
          isPassenger ? 'bg-navy-900 text-white' : 'bg-white/15 text-white'
        }`}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.609 1.814L13.792 12 3.61 22.186a1.003 1.003 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={`block text-[10px] font-semibold uppercase tracking-wider ${isPassenger ? 'text-slate-500' : 'text-white/65'}`}>
          {sublabel}
        </span>
        <span className="block text-sm font-bold leading-snug">{label}</span>
      </span>
    </a>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`landing-scroll fixed inset-0 overscroll-y-contain bg-light-100 text-navy-900 ${
        menuOpen ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'
      }`}
    >
      <LandingNav open={menuOpen} onOpenChange={setMenuOpen} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-light-50 to-light-100">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-0 h-[380px] w-[380px] rounded-full bg-[#245f8d]/[0.07] blur-[90px] landing-animate-glow" />
          <div className="absolute -right-16 top-24 h-[320px] w-[320px] rounded-full bg-accent/[0.06] blur-[80px] landing-animate-glow" />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(30,58,95,0.06) 1px, transparent 0)',
              backgroundSize: '40px 40px',
              maskImage: 'radial-gradient(ellipse 90% 70% at 50% 0%, black, transparent)',
            }}
          />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-24 sm:pt-12 lg:px-8 lg:pt-16">
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center lg:gap-12 xl:gap-16">
            <div className="min-w-0">
              <div className="landing-hero-enter mb-6 flex justify-start sm:mb-8">
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1.5 sm:px-4">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-semibold tracking-wide text-emerald-800 sm:text-xs">
                    Salta Capital · Argentina
                  </span>
                </div>
              </div>

              <h1 className="landing-hero-enter landing-hero-enter-delay-1 max-w-4xl text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-navy-900 min-[380px]:text-[2rem] sm:text-5xl lg:text-6xl">
                Tu viaje en Salta,{' '}
                <span className="landing-shimmer-text">más simple</span>
                {' '}que nunca
              </h1>

              <p className="landing-hero-enter landing-hero-enter-delay-2 mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600 sm:mt-6 sm:text-lg lg:text-xl">
                Descargá la app de pasajero para pedir un remis al instante, o unite como conductor a la flota Profesional.
                Todo conectado en tiempo real.
              </p>

              <div className="landing-hero-enter landing-hero-enter-delay-3 mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 lg:flex lg:flex-wrap">
                <HeroStoreButton href={PLAY_PASSENGER} sublabel="App para pasajeros" label="Profesional Pasajero" variant="passenger" />
                <HeroStoreButton href={PLAY_DRIVER} sublabel="App para conductores" label="Profesional Conductor" variant="driver" />
              </div>

              <div className="landing-hero-enter landing-hero-enter-delay-4 mt-8 grid grid-cols-2 gap-2.5 sm:mt-10 sm:grid-cols-4 sm:gap-3 lg:gap-4">
                {STATS.map((stat) => {
                  const isLongValue = stat.value.length > 5;
                  return (
                    <div
                      key={stat.label}
                      className="min-w-0 rounded-2xl border border-light-300/80 bg-white/80 px-3.5 py-3 shadow-sm backdrop-blur-sm sm:px-4 sm:py-4 lg:px-5"
                    >
                      <p
                        className={`font-bold leading-tight text-navy-900 ${
                          isLongValue ? 'text-[15px] sm:text-lg lg:text-xl' : 'text-base sm:text-2xl'
                        }`}
                      >
                        {stat.value}
                      </p>
                      <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">
                        {stat.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 w-full lg:mt-0">
              <HeroMapRoute />
            </div>
          </div>
        </div>
      </section>

      {/* Intro apps */}
      <section id="apps" className="border-y border-light-300/70 bg-white py-10 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <RevealSection>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent sm:text-sm sm:tracking-[0.18em]">
              Dos apps, una plataforma
            </p>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-navy-900 sm:text-3xl lg:text-4xl">
              Conocé cada experiencia
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:mt-4 sm:text-base">
              Pasajeros y conductores conectados en la misma red operativa de Salta Capital.
            </p>
          </RevealSection>
        </div>
      </section>

      <AppShowcase
        id="app-pasajero"
        variant="passenger"
        eyebrow="App Pasajero"
        title="Pedí, seguí y viajá con confianza"
        subtitle="La app de pasajeros te permite solicitar un remis en segundos, ver la ubicación del chofer en vivo y recibir actualizaciones en cada etapa del viaje."
        features={[
          'Pedí un viaje en segundos desde la app',
          'Seguí tu chofer en el mapa en tiempo real',
          'Reservá por WhatsApp con nuestro agente',
          'Historial y tarifas transparentes',
        ]}
        href={PLAY_PASSENGER}
        banner={{ src: '/landing/optimized/passenger-banner.webp', alt: 'Profesional Pasajero — portada de la app', ...BANNER_IMAGE }}
        screenshots={PASSENGER_SCREENSHOTS}
      />

      <AppShowcase
        id="app-conductor"
        variant="driver"
        eyebrow="App Conductor"
        title="Tu jornada, bajo control"
        subtitle="Sumate a la flota Profesional, recibí viajes cerca de tu ubicación y gestioná cada trayecto con herramientas pensadas para el día a día del conductor."
        features={[
          'Recibí viajes cerca de tu ubicación',
          'Panel de ganancias y comisiones claro',
          'Navegación integrada hasta el destino',
          'Comunicación directa con operaciones',
        ]}
        href={PLAY_DRIVER}
        banner={{ src: '/landing/optimized/driver-banner.webp', alt: 'Profesional Conductor — portada de la app', ...BANNER_IMAGE }}
        screenshots={DRIVER_SCREENSHOTS}
        reversed
      />

      {/* Features */}
      <section id="features" className="border-t border-light-300/70 bg-white py-12 sm:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <RevealSection className="mx-auto mb-8 max-w-2xl text-center sm:mb-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:text-sm">Tecnología</p>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-navy-900 sm:text-3xl lg:text-4xl">
              Diseñado para mover la ciudad
            </h2>
          </RevealSection>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {PLATFORM_FEATURES.map((feature, index) => (
              <RevealSection key={feature.title} delay={index * 80}>
                <div className="group h-full rounded-2xl border border-light-300/80 bg-light-100/50 p-5 transition duration-300 hover:border-navy-700/15 hover:bg-white hover:shadow-[0_16px_40px_-12px_rgba(15,23,42,0.1)] sm:p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-navy-700 shadow-sm transition group-hover:bg-accent/10 group-hover:text-accent sm:h-12 sm:w-12">
                    {feature.icon}
                  </span>
                  <h3 className="mt-4 text-base font-bold text-navy-900 sm:mt-5 sm:text-lg">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-light-300/70 bg-light-100/80 py-12 sm:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <RevealSection className="mx-auto mb-8 max-w-2xl text-center sm:mb-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:text-sm">Cómo funciona</p>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-navy-900 sm:text-3xl lg:text-4xl">
              De pedido a destino en minutos
            </h2>
          </RevealSection>

          <div className="grid gap-4 sm:gap-8 lg:grid-cols-2">
            {[
              {
                title: 'Si sos pasajero',
                steps: [
                  { n: '01', t: 'Descargá la app', d: 'Creá tu cuenta con tu número de WhatsApp.' },
                  { n: '02', t: 'Pedí tu viaje', d: 'Indicá origen y destino. Ves el precio estimado al instante.' },
                  { n: '03', t: 'Viajá tranquilo', d: 'Seguí al chofer en el mapa hasta que llegues.' },
                ],
                accent: 'border-accent/20 bg-accent/10 text-accent',
              },
              {
                title: 'Si sos conductor',
                steps: [
                  { n: '01', t: 'Registrate en la flota', d: 'Contactá a operaciones para darte de alta.' },
                  { n: '02', t: 'Conectate online', d: 'Activá disponibilidad y empezá a recibir viajes.' },
                  { n: '03', t: 'Completá y cobrá', d: 'Navegá, finalizá el viaje y llevá el control de tus ganancias.' },
                ],
                accent: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
              },
            ].map((block, blockIndex) => (
              <RevealSection key={block.title} delay={blockIndex * 100}>
                <div className="h-full rounded-[1.25rem] border border-light-300/80 bg-white p-5 shadow-sm sm:rounded-[2rem] sm:p-8">
                  <h3 className="text-base font-bold text-navy-900 sm:text-xl">{block.title}</h3>
                  <ol className="mt-5 space-y-4 sm:mt-8 sm:space-y-6">
                    {block.steps.map((step) => (
                      <li key={step.n} className="flex gap-3 sm:gap-4">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold sm:h-10 sm:w-10 sm:text-xs ${block.accent}`}>
                          {step.n}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-navy-900">{step.t}</p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.d}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA operadores */}
      <section className="border-t border-light-300/70 bg-white py-12 sm:py-24">
        <RevealSection>
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-[1.25rem] border border-navy-700/10 bg-gradient-to-br from-navy-900 via-navy-700 to-[#245f8d] p-5 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)] sm:rounded-[2rem] sm:p-10 lg:p-12">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative z-10 flex flex-col gap-5 sm:gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 max-w-xl">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50 sm:text-sm">Para operadores</p>
                  <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white sm:mt-3 sm:text-3xl lg:text-4xl">
                    Panel de control operativo
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-white/75 sm:mt-4 sm:text-[15px]">
                    Gestioná choferes, cola de pasajeros, viajes programados y estadísticas desde el dashboard web.
                  </p>
                </div>
                <Link
                  href="/admin/login"
                  className="inline-flex w-full min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-bold text-navy-900 shadow-xl transition hover:bg-light-100 sm:w-auto"
                >
                  Ingresar al panel
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </RevealSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-light-300/70 bg-light-100 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-8 sm:pb-12 sm:pt-12">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <div className="min-w-0 max-w-sm">
            <p className="text-lg font-extrabold tracking-tight text-navy-900">Profesional App</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Plataforma de transporte en Salta Capital. Apps para pasajeros y conductores.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 sm:gap-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Apps</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li><a href={PLAY_PASSENGER} target="_blank" rel="noopener noreferrer" className="inline-block py-0.5 transition hover:text-navy-900">Pasajero</a></li>
                <li><a href={PLAY_DRIVER} target="_blank" rel="noopener noreferrer" className="inline-block py-0.5 transition hover:text-navy-900">Conductor</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Legal</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li><Link href="/privacidad" className="inline-block py-0.5 transition hover:text-navy-900">Privacidad</Link></li>
                <li><Link href="/eliminacion-cuenta" className="inline-block py-0.5 transition hover:text-navy-900">Eliminar cuenta</Link></li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Soporte</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li><Link href="/contacto" className="inline-block py-0.5 transition hover:text-navy-900">Contacto</Link></li>
                <li><Link href="/admin/login" className="inline-block py-0.5 transition hover:text-navy-900">Operadores</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 w-full max-w-6xl border-t border-light-300/70 px-4 pt-6 sm:mt-10 sm:px-6 sm:pt-8 lg:px-8">
          <p className="text-center text-[11px] text-slate-500 sm:text-xs">
            © {new Date().getFullYear()} Profesional App · Salta Capital, Argentina
          </p>
        </div>
      </footer>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-light-300/80 bg-white/95 p-3 backdrop-blur-xl sm:hidden pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto mx-auto flex w-full max-w-lg gap-2">
          <a
            href={PLAY_PASSENGER}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-accent px-2 py-3 text-[11px] font-bold text-white shadow-lg shadow-accent/20 min-[360px]:text-xs"
          >
            App Pasajero
          </a>
          <a
            href={PLAY_DRIVER}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-light-300 bg-light-100 px-2 py-3 text-[11px] font-bold text-navy-900 min-[360px]:text-xs"
          >
            App Conductor
          </a>
        </div>
      </div>
    </div>
  );
}
