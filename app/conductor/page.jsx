import DriverApp from '../../src/spa/conductor/DriverApp';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.profesionalviajes.com.ar';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Conductor · Profesional',
  description: 'Recibí y gestioná viajes en Salta Capital desde el navegador. Misma plataforma que la app de conductores.',
  robots: { index: true, follow: true },
};

export default function ConductorPage() {
  return <DriverApp />;
}
