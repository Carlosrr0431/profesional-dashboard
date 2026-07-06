import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';

const BRAND = {
  navy: '#282e69',
  blue: '#245f8d',
  blueLight: '#3480b8',
};

export const alt = 'Profesional App · Viajes en Salta Capital';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const svg = await readFile(join(process.cwd(), 'public', 'Profesional app-02.svg'));
  const logoSrc = `data:image/svg+xml;base64,${svg.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
          background: `linear-gradient(135deg, #ffffff 0%, #f4f7fb 42%, #e8eef8 100%)`,
          position: 'relative',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: `linear-gradient(90deg, ${BRAND.navy} 0%, ${BRAND.blue} 50%, ${BRAND.blueLight} 100%)`,
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -60,
            width: 360,
            height: 360,
            borderRadius: '50%',
            background: 'rgba(36, 95, 141, 0.14)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            left: -40,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'rgba(40, 46, 105, 0.08)',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
          <img
            src={logoSrc}
            alt="Profesional App"
            height={72}
            style={{ objectFit: 'contain', objectPosition: 'left center' }}
          />
          <span style={{ fontSize: 20, fontWeight: 600, color: BRAND.blue }}>
            Salta Capital · Argentina
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative', maxWidth: 920 }}>
          <div
            style={{
              fontSize: 62,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: '#0f172a',
              display: 'flex',
              flexWrap: 'wrap',
            }}
          >
            <span>Tu viaje en Salta,&nbsp;</span>
            <span style={{ color: BRAND.blue }}>más simple</span>
            <span>&nbsp;que nunca</span>
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.35, color: '#475569', maxWidth: 860 }}>
            Apps para pasajeros y conductores con seguimiento en tiempo real.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
          {[
            { label: 'App Pasajero', primary: true },
            { label: 'App Conductor', primary: false },
            { label: 'Tiempo real', primary: false },
          ].map(({ label, primary }) => (
            <div
              key={label}
              style={{
                padding: '12px 22px',
                borderRadius: 999,
                backgroundColor: primary ? BRAND.blue : '#ffffff',
                color: primary ? '#ffffff' : BRAND.navy,
                fontSize: 20,
                fontWeight: 700,
                border: primary ? 'none' : `2px solid rgba(36, 95, 141, 0.2)`,
                boxShadow: primary
                  ? '0 8px 24px rgba(36, 95, 141, 0.28)'
                  : '0 8px 24px rgba(15, 23, 42, 0.08)',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
