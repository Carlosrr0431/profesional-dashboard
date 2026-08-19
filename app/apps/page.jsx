import { Plus_Jakarta_Sans } from 'next/font/google';
import AppsFichaPage from '../../src/components/landing/AppsFichaPage';

const displayFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.profesionalviajes.com.ar';
const PAGE_PATH = '/apps';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Descargar apps · Profesional',
  description:
    'Descargá las apps o pedí un viaje por WhatsApp al +54 9 3872 13-8777. Viajes en Salta Capital.',
  alternates: {
    canonical: `${SITE_URL}${PAGE_PATH}`,
  },
  openGraph: {
    title: 'Descargar apps · Profesional',
    description:
      'Descargá las apps o pedí un viaje por WhatsApp al +54 9 3872 13-8777.',
    url: `${SITE_URL}${PAGE_PATH}`,
    siteName: 'Profesional App',
    locale: 'es_AR',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Descargar apps · Profesional',
    description:
      'Descargá las apps o pedí un viaje por WhatsApp al +54 9 3872 13-8777.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F4F6F9',
};

function normalizeFocus(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'pasajero' || value === 'passenger' || value === 'p') return 'pasajero';
  if (value === 'conductor' || value === 'driver' || value === 'c') return 'conductor';
  return null;
}

export default async function AppsPage({ searchParams }) {
  const params = await searchParams;
  const focus = normalizeFocus(params?.app);

  return (
    <div className={displayFont.className}>
      <AppsFichaPage focus={focus} />
    </div>
  );
}
