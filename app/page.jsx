import { Plus_Jakarta_Sans } from 'next/font/google';
import LandingPage from '../src/components/landing/LandingPage';

const displayFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://profesional-dashboard.vercel.app';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Profesional App · Transporte en Salta Capital',
  description:
    'Pedí tu viaje o unite a la flota. Apps para pasajeros y conductores en Salta Capital, Argentina.',
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: 'Profesional App · Transporte en Salta Capital',
    description:
      'Descargá Profesional Pasajero o Profesional Conductor. Viajes en tiempo real en Salta Capital.',
    url: SITE_URL,
    siteName: 'Profesional App',
    locale: 'es_AR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Profesional App · Transporte en Salta Capital',
    description:
      'Descargá Profesional Pasajero o Profesional Conductor. Viajes en tiempo real en Salta Capital.',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function HomePage() {
  return (
    <div className={displayFont.className}>
      <LandingPage />
    </div>
  );
}
