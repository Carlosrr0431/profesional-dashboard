const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.profesionalviajes.com.ar';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  manifest: '/pasajero.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Profesional Pasajero',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/pwa/apple-touch-180.png',
    icon: [
      { url: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export const viewport = {
  themeColor: '#282e69',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function PasajeroLayout({ children }) {
  return children;
}
