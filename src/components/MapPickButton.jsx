'use client';

const STYLES = `
@keyframes _map_pick_pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--map-pick-glow); }
  50% { box-shadow: 0 0 0 6px transparent; }
}
`;

function MapIcon({ color = 'currentColor' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 6.8 9 4.5l6 2.6 5.5-2.6v12.4L15 19.5l-6-2.6-5.5 2.6V6.8Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 4.5v12.4M15 7.1v12.4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function MapPickButton({
  kind = 'origin',
  active = false,
  picked = false,
  busy = false,
  onClick,
}) {
  const isOrigin = kind === 'origin';
  const accent = isOrigin ? '#E11D48' : '#059669';
  const accentSoft = isOrigin ? '#FFF1F2' : '#ECFDF5';

  let aria = isOrigin ? 'Marcar origen en el mapa' : 'Marcar destino en el mapa';
  if (busy) aria = 'Buscando dirección…';
  else if (active) aria = isOrigin ? 'Tocá el mapa para marcar el origen' : 'Tocá el mapa para marcar el destino';
  else if (picked) aria = isOrigin ? 'Cambiar origen en el mapa' : 'Cambiar destino en el mapa';

  return (
    <>
      <style>{STYLES}</style>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        aria-pressed={active}
        aria-label={aria}
        title={aria}
        style={{
          '--map-pick-glow': isOrigin ? 'rgba(225,29,72,0.35)' : 'rgba(5,150,105,0.35)',
          height: 28,
          padding: '0 8px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          border: 'none',
          borderRadius: 8,
          background: active ? accent : (picked ? accentSoft : '#F1F5F9'),
          color: active ? '#FFFFFF' : accent,
          fontSize: 11,
          fontWeight: 800,
          fontFamily: 'inherit',
          letterSpacing: '0.01em',
          cursor: busy ? 'wait' : 'pointer',
          animation: active ? '_map_pick_pulse 1.4s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }}
      >
        <MapIcon color={active ? '#FFFFFF' : accent} />
        <span>{busy ? '…' : 'Mapa'}</span>
      </button>
    </>
  );
}
