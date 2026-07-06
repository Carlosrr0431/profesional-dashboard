import { ImageResponse } from 'next/og';

export const alt = 'Profesional App · Transporte en Salta Capital';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
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
          background: 'linear-gradient(135deg, #ffffff 0%, #f4f7fb 42%, #e8eef8 100%)',
          position: 'relative',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -60,
            width: 360,
            height: 360,
            borderRadius: '50%',
            background: 'rgba(36, 95, 141, 0.12)',
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
            background: 'rgba(220, 38, 38, 0.08)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              background: 'linear-gradient(145deg, #282e69 0%, #245f8d 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 42,
              fontWeight: 800,
              boxShadow: '0 18px 40px rgba(40, 46, 105, 0.25)',
            }}
          >
            P
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: '#282e69', letterSpacing: -1 }}>
              Profesional App
            </span>
            <span style={{ fontSize: 20, fontWeight: 600, color: '#245f8d', marginTop: 4 }}>
              Salta Capital · Argentina
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative', maxWidth: 920 }}>
          <div
            style={{
              fontSize: 62,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: '#0f172a',
            }}
          >
            Tu viaje en Salta, más simple que nunca
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.35, color: '#475569', maxWidth: 860 }}>
            Apps para pasajeros y conductores con seguimiento en tiempo real.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
          {['App Pasajero', 'App Conductor', 'Tiempo real'].map((label) => (
            <div
              key={label}
              style={{
                padding: '12px 22px',
                borderRadius: 999,
                background: label === 'App Pasajero' ? '#dc2626' : '#ffffff',
                color: label === 'App Pasajero' ? '#ffffff' : '#282e69',
                fontSize: 20,
                fontWeight: 700,
                border: label === 'App Pasajero' ? 'none' : '2px solid rgba(40, 46, 105, 0.12)',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
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
