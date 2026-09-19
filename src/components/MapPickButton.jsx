'use client';

function PinIcon({ color = '#DC2626' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-6.2 7-11.2A7 7 0 1 0 5 9.8C5 14.8 12 21 12 21Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.8" r="2.2" fill={color} />
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
  const accentBorder = isOrigin ? '#FECDD3' : '#A7F3D0';

  let label = isOrigin ? 'Marcar origen en el mapa' : 'Marcar destino en el mapa';
  if (busy) label = 'Buscando dirección…';
  else if (active) label = isOrigin ? 'Tocá el mapa: origen' : 'Tocá el mapa: destino';
  else if (picked) label = isOrigin ? 'Cambiar origen en el mapa' : 'Cambiar destino en el mapa';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={active
        ? 'Hacé clic en el mapa para fijar latitud y longitud'
        : 'Otra opción: elegir el punto GPS tocando el mapa'}
      style={{
        width: '100%',
        marginTop: 8,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        border: `1.5px solid ${active ? accent : accentBorder}`,
        background: active ? accent : accentSoft,
        color: active ? '#FFFFFF' : accent,
        fontSize: 12,
        fontWeight: 800,
        fontFamily: 'inherit',
        letterSpacing: '0.01em',
        cursor: busy ? 'wait' : 'pointer',
        boxShadow: active ? `0 6px 16px ${isOrigin ? 'rgba(225,29,72,0.28)' : 'rgba(5,150,105,0.22)'}` : 'none',
        animation: active
          ? `${isOrigin ? '_ntm_pick_pulse' : '_ntm_pick_pulse_dest'} 1.4s ease-in-out infinite`
          : 'none',
      }}
    >
      <PinIcon color={active ? '#FFFFFF' : accent} />
      <span>{label}</span>
    </button>
  );
}
