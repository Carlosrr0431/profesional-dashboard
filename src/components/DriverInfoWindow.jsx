import { timeAgo, formatSpeed, formatPrice, getTripStatus } from '../lib/utils';

function getDriverStatusInfo(driver) {
  if (driver.commissionOverdue) {
    return { label: 'Bloqueado', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', busy: true };
  }
  if (driver.activeTrip) {
    const s = getTripStatus(driver.activeTrip.status);
    return { label: s.label, color: '#EF4444', bg: 'rgba(220,38,38,0.15)', busy: true };
  }
  if (driver.isOnline) return { label: 'Disponible', color: '#4ADE80', bg: 'rgba(74,222,128,0.15)', busy: false };
  return { label: 'Desconectado', color: '#94A3B8', bg: 'rgba(148,163,184,0.15)', busy: true };
}

export default function DriverInfoWindow({ driver, onAssignTrip }) {
  const initials = driver.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const status = getDriverStatusInfo(driver);
  const canAssign = !status.busy;

  return (
    <div style={{ background: '#162036', color: '#fff', padding: '14px', minWidth: '250px', borderRadius: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #253352' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px',
          background: driver.isOnline ? 'rgba(74,222,128,0.12)' : 'rgba(148,163,184,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 700,
          color: driver.isOnline ? '#4ADE80' : '#94A3B8',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <p style={{ color: '#fff', fontSize: '14px', fontWeight: 700, margin: 0 }}>{driver.fullName}</p>
            {driver.driverNumber && (
              <span style={{
                fontSize: '10px', fontWeight: 800, color: '#EF4444',
                background: 'rgba(220,38,38,0.15)', padding: '1px 6px',
                borderRadius: '5px',
              }}>#{driver.driverNumber}</span>
            )}
          </div>
          <p style={{ color: '#94A3B8', fontSize: '11px', margin: '2px 0 0' }}>{driver.phone || 'Sin teléfono'}</p>
        </div>
        <span style={{
          fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '20px',
          background: status.bg, color: status.color,
        }}>
          {status.label}
        </span>
      </div>

      {/* Vehicle info */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <div style={{
          background: driver.vehicleType === 'moto' ? 'rgba(245,158,11,0.12)' : 'rgba(220,38,38,0.12)',
          borderRadius: '8px', padding: '8px', textAlign: 'center', minWidth: '50px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '16px' }}>{driver.vehicleType === 'moto' ? '🏍️' : '🚗'}</span>
          <p style={{
            fontSize: '9px', fontWeight: 700, margin: '2px 0 0',
            color: driver.vehicleType === 'moto' ? '#F59E0B' : '#EF4444',
          }}>
            {driver.vehicleType === 'moto' ? 'Moto' : 'Auto'}
          </p>
        </div>
        <div style={{ flex: 1, background: '#111B2E', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', color: '#94A3B8', margin: 0 }}>Vehículo</p>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#fff', margin: '2px 0 0' }}>{driver.vehicleBrand} {driver.vehicleModel}</p>
        </div>
        <div style={{ background: '#111B2E', borderRadius: '8px', padding: '8px', textAlign: 'center', minWidth: '70px' }}>
          <p style={{ fontSize: '10px', color: '#94A3B8', margin: 0 }}>Patente</p>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', margin: '2px 0 0' }}>{driver.vehiclePlate || '-'}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
        <InfoStat label="Velocidad" value={formatSpeed(driver.speed)} />
        <InfoStat label="Rating" value={`⭐ ${driver.rating.toFixed(1)}`} />
        <InfoStat label="Viajes" value={String(driver.totalTrips)} />
      </div>

      {/* Last seen */}
      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', color: '#94A3B8' }}>Última actualización</span>
        <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 500 }}>{timeAgo(driver.updatedAt)}</span>
      </div>

      {/* Active trip info */}
      {driver.activeTrip && (
        <div style={{ marginTop: '10px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
          <p style={{ fontSize: '10px', color: '#EF4444', fontWeight: 600, margin: 0 }}>{driver.vehicleType === 'moto' ? '🏍️' : '🚗'} Viaje activo</p>
          <p style={{ fontSize: '11px', color: '#ccc', margin: '3px 0 0' }}>→ {driver.activeTrip.destination_address}</p>
        </div>
      )}

      {/* Commission balance */}
      {driver.commissionBalance > 0 && (
        <div style={{
          marginTop: '10px', borderRadius: '8px', padding: '8px 10px',
          background: driver.commissionOverdue ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
          border: `1px solid ${driver.commissionOverdue ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '10px', color: driver.commissionOverdue ? '#EF4444' : '#F59E0B', fontWeight: 600, margin: 0 }}>
              {driver.commissionOverdue ? '⚠️ Comisión vencida' : '💰 Comisión pendiente'}
            </p>
            <p style={{ fontSize: '12px', color: driver.commissionOverdue ? '#EF4444' : '#F59E0B', fontWeight: 700, margin: 0 }}>
              {formatPrice(driver.commissionBalance)}
            </p>
          </div>
        </div>
      )}

      {/* Assign Trip Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (canAssign && onAssignTrip) onAssignTrip(driver);
        }}
        disabled={!canAssign}
        title={!canAssign ? (driver.commissionOverdue ? 'Comisión vencida' : driver.activeTrip ? 'Chofer en viaje' : 'Chofer desconectado') : 'Asignar un viaje'}
        style={{
          width: '100%',
          marginTop: '10px',
          padding: '8px 12px',
          background: canAssign ? 'linear-gradient(135deg, #EF4444, #DC2626)' : '#253352',
          border: 'none',
          borderRadius: '8px',
          color: canAssign ? '#fff' : '#666',
          fontSize: '12px',
          fontWeight: 700,
          cursor: canAssign ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          opacity: canAssign ? 1 : 0.6,
        }}
      >
        {canAssign ? '🚖 Asignar Viaje' : (driver.commissionOverdue ? '⚠️ Bloqueado' : driver.activeTrip ? '🔒 En viaje' : '🔒 Desconectado')}
      </button>
    </div>
  );
}

function InfoStat({ label, value }) {
  return (
    <div style={{ background: '#111B2E', borderRadius: '8px', padding: '6px', textAlign: 'center' }}>
      <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '12px', fontWeight: 600, color: '#fff', margin: '2px 0 0' }}>{value}</p>
    </div>
  );
}
