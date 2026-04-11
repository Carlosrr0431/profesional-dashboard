import { timeAgo, formatSpeed } from '../lib/utils';

export default function DriverInfoWindow({ driver }) {
  return (
    <div className="p-3 min-w-[220px]" style={{ background: '#1a1a2e', color: '#fff' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-[#2a2a4a] flex items-center justify-center text-xs font-bold" style={{ color: '#7B73FF' }}>
          {driver.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: '#fff' }}>{driver.fullName}</p>
          <p className="text-xs" style={{ color: '#9ca3af' }}>{driver.phone || 'Sin teléfono'}</p>
        </div>
      </div>

      <div className="space-y-1 text-xs" style={{ color: '#d1d5db' }}>
        <div className="flex justify-between">
          <span style={{ color: '#9ca3af' }}>Vehículo</span>
          <span>{driver.vehicleBrand} {driver.vehicleModel}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#9ca3af' }}>Patente</span>
          <span style={{ fontWeight: 600 }}>{driver.vehiclePlate || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#9ca3af' }}>Color</span>
          <span>{driver.vehicleColor || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#9ca3af' }}>Velocidad</span>
          <span>{formatSpeed(driver.speed)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#9ca3af' }}>Rating</span>
          <span>⭐ {driver.rating.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#9ca3af' }}>Viajes</span>
          <span>{driver.totalTrips}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#9ca3af' }}>Última vez</span>
          <span>{timeAgo(driver.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
