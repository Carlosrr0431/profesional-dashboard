import PassengerApp from '../../src/spa/pasajero/PassengerApp';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.profesionalviajes.com.ar';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Pasajero · Profesional',
  description: 'Pedí un viaje en Salta Capital desde el navegador. Misma plataforma que la app de pasajeros.',
  robots: { index: true, follow: true },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F4F7FC',
};

export default function PasajeroPage() {
  return <PassengerApp />;
}
