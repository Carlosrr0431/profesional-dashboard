const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.profesionalviajes.com.ar';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  manifest: '/conductor.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Profesional Conductor',
    statusBarStyle: 'black-translucent',
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
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function ConductorLayout({ children }) {
  return <div className="spa-root">{children}</div>;
}
