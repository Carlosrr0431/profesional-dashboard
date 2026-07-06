'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useReveal } from './useReveal';
import LandingLogo from './LandingLogo';
import LandingNav from './LandingNav';
const PLAY_PASSENGER = 'https://play.google.com/store/apps/details?id=com.remises.passengerapp';
const PLAY_DRIVER = 'https://play.google.com/store/apps/details?id=com.remises.driverapp';

const STATS = [
  { value: 'Salta', label: 'Capital' },
  { value: '24/7', label: 'Disponible' },
  { value: 'Live', label: 'Tiempo real' },
  { value: 'WhatsApp', label: 'Reservas' },
];

const PASSENGER_FEATURES = [
  'Pedí un viaje en segundos desde la app',
  'Seguí tu chofer en el mapa en tiempo real',
  'Reservá por WhatsApp con nuestro agente',
  'Historial y tarifas transparentes',
];

const DRIVER_FEATURES = [
  'Recibí viajes cerca de tu ubicación',
  'Panel de ganancias y comisiones claro',
  'Navegación integrada hasta el destino',
  'Comunicación directa con operaciones',
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

function StoreButton({ href, label, sublabel, variant = 'light', fullWidth = false }) {
  const styles =
    variant === 'dark'
      ? 'border-white/15 bg-white/10 text-white hover:bg-white/15'
      : 'border-navy-900/10 bg-white text-navy-900 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/10';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex w-full items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-300 sm:w-auto ${styles} ${
        fullWidth ? 'sm:max-w-none' : ''
      }`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-white group-hover:scale-105 transition-transform">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.609 1.814L13.792 12 3.61 22.186a1.003 1.003 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
        </svg>
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[10px] font-medium uppercase tracking-wider opacity-60">{sublabel}</span>
        <span className="block truncate text-sm font-bold sm:whitespace-normal">{label}</span>
      </span>
    </a>
  );
}

function PhoneMockup({ variant = 'passenger' }) {
  const isPassenger = variant === 'passenger';

  return (
    <div className={`relative mx-auto w-[210px] sm:w-[260px] ${isPassenger ? 'landing-animate-float' : 'landing-animate-float-delayed'}`}>
      <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-accent/25 via-transparent to-navy-700/30 blur-2xl landing-animate-glow" />
      <div className="relative overflow-hidden rounded-[2.4rem] border border-white/20 bg-[#0a1220] p-2 shadow-2xl shadow-black/40">
        <div className="absolute left-1/2 top-3 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black/80" />
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#eef2f8] to-[#d8e0ec]">
          <div className="flex items-center justify-between px-3 pb-2 pt-8 sm:px-4">
            <img src="/logo.png" alt="Profesional" className="h-5 w-auto max-w-[88px] object-contain" draggable={false} />
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              En vivo
            </span>
          </div>

          <div className="relative mx-3 mb-3 h-[240px] overflow-hidden rounded-2xl border border-white/60 bg-[#c8d4e4] sm:h-[280px]">
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 280" fill="none">
              <path
                className="landing-route-line"
                d="M40 220 C 70 180, 90 140, 120 110 S 160 70, 165 45"
                stroke={isPassenger ? '#DC2626' : '#1E3A5F'}
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute left-8 top-[200px] h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow-lg" />
            <div className="absolute right-10 top-10 h-4 w-4 rounded-full border-2 border-white bg-accent shadow-lg" />
            <div
              className={`absolute left-[88px] top-[118px] flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow-lg ${
                isPassenger ? 'bg-navy-900' : 'bg-emerald-600'
              }`}
            >
              <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
              </svg>
            </div>
          </div>

          <div className="mx-3 mb-4 rounded-2xl border border-white/70 bg-white/90 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-bold text-navy-900">
              {isPassenger ? 'Tu chofer está en camino' : 'Nuevo viaje asignado'}
            </p>
            <p className="mt-0.5 text-[10px] text-gray-500">
              {isPassenger ? 'Llegada estimada · 4 min' : 'Origen · 1.2 km · $2.800 est.'}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-light-200">
              <div
                className={`h-full rounded-full ${isPassenger ? 'w-[72%] bg-accent' : 'w-[45%] bg-emerald-500'}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppCard({ type, title, subtitle, features, href, accentClass, delay = 0 }) {
  const isPassenger = type === 'passenger';

  return (
    <RevealSection delay={delay} className="h-full">
      <div
        className={`group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md transition-all duration-500 hover:border-white/20 hover:bg-white/[0.07] sm:rounded-[2rem] sm:p-8 ${
          isPassenger ? 'lg:flex-row lg:items-center lg:gap-10' : 'lg:flex-row-reverse lg:items-center lg:gap-10'
        }`}
      >
        <div
          aria-hidden
          className={`pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-60 ${accentClass}`}
        />

        <div className="relative z-10 flex-1">
          <span
            className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
              isPassenger ? 'bg-accent/15 text-red-200' : 'bg-emerald-500/15 text-emerald-200'
            }`}
          >
            {isPassenger ? 'App Pasajero' : 'App Conductor'}
          </span>
          <h3 className="text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">{title}</h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/55 sm:text-[15px]">{subtitle}</p>

          <ul className="mt-6 space-y-2.5">
            {features.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-white/70">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isPassenger ? 'bg-accent/20 text-red-200' : 'bg-emerald-500/20 text-emerald-200'}`}>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-6 sm:mt-8">
            <StoreButton
              href={href}
              sublabel="Disponible en"
              label="Google Play"
              variant="dark"
              fullWidth
            />
          </div>
        </div>

        <div className="relative z-10 mt-8 flex shrink-0 justify-center sm:mt-10 lg:mt-0">
          <PhoneMockup variant={type} />
        </div>
      </div>
    </RevealSection>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`landing-scroll fixed inset-0 overscroll-y-contain bg-[#050a14] text-white ${
        menuOpen ? 'overflow-hidden' : 'overflow-y-auto'
      }`}
    >
      <LandingNav open={menuOpen} onOpenChange={setMenuOpen} />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-0 h-[420px] w-[420px] rounded-full bg-navy-700/30 blur-[100px] landing-animate-glow" />
          <div className="absolute -right-24 top-32 h-[360px] w-[360px] rounded-full bg-accent/20 blur-[90px] landing-animate-glow" />
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)',
              backgroundSize: '64px 64px',
              maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent)',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pb-28 sm:pt-16 lg:px-8 lg:pt-24">
          <div className="landing-hero-enter mb-8 flex flex-col gap-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
            <LandingLogo size="hero" withGlow className="landing-hero-enter-delay-1" />
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-xs font-medium tracking-wide text-white/70">Salta Capital · Argentina</span>
            </div>
          </div>

          <h1 className="landing-hero-enter landing-hero-enter-delay-1 max-w-4xl text-[2rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Tu viaje en Salta,{' '}
            <span className="landing-shimmer-text">más simple</span>
            {' '}que nunca
          </h1>

          <p className="landing-hero-enter landing-hero-enter-delay-2 mt-5 max-w-2xl text-base leading-relaxed text-white/55 sm:mt-6 sm:text-lg lg:text-xl">
            Descargá la app de pasajero para pedir un remis al instante, o unite como conductor a la flota Profesional.
            Todo conectado en tiempo real.
          </p>

          <div className="landing-hero-enter landing-hero-enter-delay-3 mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <StoreButton href={PLAY_PASSENGER} sublabel="App para pasajeros" label="Profesional Pasajero" variant="dark" fullWidth />
            <StoreButton href={PLAY_DRIVER} sublabel="App para conductores" label="Profesional Conductor" variant="dark" fullWidth />
          </div>

          <div className="landing-hero-enter landing-hero-enter-delay-4 mt-10 grid grid-cols-2 gap-2.5 sm:mt-14 sm:grid-cols-4 sm:gap-4">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-4"
              >
                <p className="text-lg font-bold text-white sm:text-2xl">{stat.value}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-white/45 sm:text-xs">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Apps ────────────────────────────────────────────────────────────── */}
      <section id="apps" className="relative border-t border-white/[0.06] bg-[#070d18] py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <RevealSection className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent sm:text-sm sm:tracking-[0.2em]">Dos apps, una plataforma</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Elegí tu rol y empezá hoy</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/50">
              Pasajeros y conductores conectados en la misma red operativa de Salta Capital.
            </p>
          </RevealSection>

          <div className="space-y-5 sm:space-y-8">
            <AppCard
              type="passenger"
              title="Profesional Pasajero"
              subtitle="Pedí tu viaje, seguí al chofer en el mapa y recibí notificaciones en cada etapa del trayecto."
              features={PASSENGER_FEATURES}
              href={PLAY_PASSENGER}
              accentClass="bg-accent/25"
              delay={0}
            />
            <AppCard
              type="driver"
              title="Profesional Conductor"
              subtitle="Sumate a la flota, recibí viajes cerca tuyo y gestioná tu jornada con herramientas pensadas para el día a día."
              features={DRIVER_FEATURES}
              href={PLAY_DRIVER}
              accentClass="bg-emerald-500/20"
              delay={120}
            />
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="border-t border-white/[0.06] py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <RevealSection className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40 sm:text-sm sm:tracking-[0.2em]">Tecnología</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Diseñado para mover la ciudad</h2>
          </RevealSection>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {PLATFORM_FEATURES.map((feature, index) => (
              <RevealSection key={feature.title} delay={index * 80}>
                <div className="group h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.06] sm:p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/80 transition group-hover:bg-accent/20 group-hover:text-red-200">
                    {feature.icon}
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{feature.desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how" className="border-t border-white/[0.06] bg-[#070d18] py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <RevealSection className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40 sm:text-sm sm:tracking-[0.2em]">Cómo funciona</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">De pedido a destino en minutos</h2>
          </RevealSection>

          <div className="grid gap-5 sm:gap-8 lg:grid-cols-2">
            {[
              {
                title: 'Si sos pasajero',
                steps: [
                  { n: '01', t: 'Descargá la app', d: 'Creá tu cuenta con tu número de WhatsApp.' },
                  { n: '02', t: 'Pedí tu viaje', d: 'Indicá origen y destino. Ves el precio estimado al instante.' },
                  { n: '03', t: 'Viajá tranquilo', d: 'Seguí al chofer en el mapa hasta que llegues.' },
                ],
                accent: 'border-accent/30 bg-accent/10 text-red-200',
              },
              {
                title: 'Si sos conductor',
                steps: [
                  { n: '01', t: 'Registrate en la flota', d: 'Contactá a operaciones para darte de alta.' },
                  { n: '02', t: 'Conectate online', d: 'Activá disponibilidad y empezá a recibir viajes.' },
                  { n: '03', t: 'Completá y cobrá', d: 'Navegá, finalizá el viaje y llevá el control de tus ganancias.' },
                ],
                accent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
              },
            ].map((block, blockIndex) => (
              <RevealSection key={block.title} delay={blockIndex * 100}>
                <div className="h-full rounded-[1.5rem] border border-white/[0.08] bg-white/[0.03] p-5 sm:rounded-[2rem] sm:p-8">
                  <h3 className="text-lg font-bold text-white sm:text-xl">{block.title}</h3>
                  <ol className="mt-6 space-y-5 sm:mt-8 sm:space-y-6">
                    {block.steps.map((step) => (
                      <li key={step.n} className="flex gap-4">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${block.accent}`}>
                          {step.n}
                        </span>
                        <div>
                          <p className="font-semibold text-white">{step.t}</p>
                          <p className="mt-1 text-sm leading-relaxed text-white/50">{step.d}</p>
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

      {/* ── CTA operadores ────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.06] py-14 sm:py-20 lg:py-24">
        <RevealSection>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-navy-900 via-[#0f1f38] to-[#0a1220] p-6 sm:rounded-[2rem] sm:p-10 lg:p-12">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative z-10 flex flex-col gap-6 sm:gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <LandingLogo size="md" className="mb-5 sm:mb-6" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40 sm:text-sm sm:tracking-[0.2em]">Para operadores</p>
                  <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Panel de control operativo</h2>
                  <p className="mt-4 text-sm leading-relaxed text-white/55 sm:text-[15px]">
                    Gestioná choferes, cola de pasajeros, viajes programados y estadísticas desde el dashboard web.
                  </p>
                </div>
                <Link
                  href="/admin/login"
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-bold text-navy-900 shadow-xl transition hover:bg-light-100 sm:w-auto"
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

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] bg-[#040810] pb-28 pt-10 sm:pb-12 sm:pt-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <div className="max-w-sm">
            <LandingLogo size="lg" />
            <p className="mt-5 text-sm leading-relaxed text-white/40">
              Plataforma de transporte en Salta Capital. Apps para pasajeros y conductores.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 sm:gap-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Apps</p>
              <ul className="mt-3 space-y-2 text-sm text-white/55">
                <li><a href={PLAY_PASSENGER} target="_blank" rel="noopener noreferrer" className="transition hover:text-white">Pasajero</a></li>
                <li><a href={PLAY_DRIVER} target="_blank" rel="noopener noreferrer" className="transition hover:text-white">Conductor</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Legal</p>
              <ul className="mt-3 space-y-2 text-sm text-white/55">
                <li><Link href="/privacidad" className="transition hover:text-white">Privacidad</Link></li>
                <li><Link href="/eliminacion-cuenta" className="transition hover:text-white">Eliminar cuenta</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Soporte</p>
              <ul className="mt-3 space-y-2 text-sm text-white/55">
                <li><Link href="/contacto" className="transition hover:text-white">Contacto</Link></li>
                <li><Link href="/admin/login" className="transition hover:text-white">Operadores</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-6xl border-t border-white/[0.06] px-4 pt-6 sm:mt-10 sm:px-6 sm:pt-8 lg:px-8">
          <p className="text-center text-[11px] text-white/30 sm:text-xs">
            © {new Date().getFullYear()} Profesional App · Salta Capital, Argentina
          </p>
        </div>
      </footer>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#050a14]/95 p-3 backdrop-blur-xl sm:hidden pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto mx-auto flex max-w-lg gap-2">
          <a
            href={PLAY_PASSENGER}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center rounded-xl bg-accent px-3 py-3 text-xs font-bold text-white shadow-lg shadow-accent/20"
          >
            App Pasajero
          </a>
          <a
            href={PLAY_DRIVER}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-xs font-bold text-white"
          >
            App Conductor
          </a>
        </div>
      </div>
    </div>
  );
}
