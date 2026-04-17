import './globals.css';

export const metadata = {
  title: 'Profesional App Dashboard',
  description: 'Panel de administración Profesional App',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-dark-900 text-white font-sans">
        {children}
      </body>
    </html>
  );
}
