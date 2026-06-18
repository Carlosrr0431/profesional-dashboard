import { timeAgo } from '../lib/utils';

function formatPickupAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) return 'Sin dirección';
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && /^A?\d{4}/i.test(parts[1])) return parts[0];
  return parts.slice(0, 2).join(', ');
}

function getQueueStatusMeta(status) {
  if (status === 'pending') {
    return {
      label: 'Esperando aceptación',
      tone: '#DC2626',
      bg: 'rgba(220, 38, 38, 0.08)',
      ring: 'rgba(220, 38, 38, 0.18)',
    };
  }
  return {
    label: 'En cola',
    tone: '#D97706',
    bg: 'rgba(245, 158, 11, 0.1)',
    ring: 'rgba(245, 158, 11, 0.22)',
  };
}

export default function PassengerInfoWindow({ trip }) {
  const status = getQueueStatusMeta(trip?.status);
  const initials = String(trip?.passengerName || 'P')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'P';

  return (
    <div
      className="passenger-iw-card"
      style={{
        minWidth: 248,
        maxWidth: 280,
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '14px 14px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: status.bg,
            border: `1px solid ${status.ring}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: status.tone,
            fontSize: 13,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: '#0F172A',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {trip?.passengerName || 'Pasajero'}
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: status.tone,
              background: status.bg,
              border: `1px solid ${status.ring}`,
              borderRadius: 999,
              padding: '3px 8px',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: status.tone,
                boxShadow: `0 0 0 3px ${status.ring}`,
              }}
            />
            {status.label}
          </span>
        </div>
      </div>

      <div
        style={{
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '10px 12px',
          marginBottom: 10,
        }}
      >
        <p
          style={{
            margin: '0 0 4px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#94A3B8',
          }}
        >
          Retiro
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: '#334155',
            lineHeight: 1.45,
          }}
        >
          {formatPickupAddress(trip?.address)}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#94A3B8' }}>Tiempo de espera</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{timeAgo(trip?.createdAt)}</span>
      </div>

      {trip?.passengerPhone && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid #EEF2F7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: '#94A3B8' }}>Teléfono</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{trip.passengerPhone}</span>
        </div>
      )}
    </div>
  );
}

export { formatPickupAddress, getQueueStatusMeta };
