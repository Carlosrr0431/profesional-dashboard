import { Plus_Jakarta_Sans } from 'next/font/google';
import LandingPage from '../src/components/landing/LandingPage';

const displayFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
});

export const metadata = {
  title: 'Profesional App · Transporte en Salta Capital',
  description:
    'Pedí tu viaje o unite a la flota. Apps para pasajeros y conductores en Salta Capital, Argentina.',
  openGraph: {
    title: 'Profesional App · Transporte en Salta Capital',
    description:
      'Descargá Profesional Pasajero o Profesional Conductor. Viajes en tiempo real en Salta Capital.',
    locale: 'es_AR',
    type: 'website',
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
