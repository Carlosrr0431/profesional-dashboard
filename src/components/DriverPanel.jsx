import { useState } from 'react';
import { useDriverTrips } from '../hooks/useTrips';
import { formatPrice, formatKm, formatDuration, formatTime, formatDateTime, getTripStatus } from '../lib/utils';
import { supabase } from '../lib/supabase';
import VoiceChat from './VoiceChat';

export default function DriverPanel({ driver, onClose, onAssignTrip, commissionPercent }) {
  const { trips, loading, stats, refetchPayments } = useDriverTrips(driver?.id);
  const [tab, setTab] = useState('today');
  const [payingCommission, setPayingCommission] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [showVoice, setShowVoice] = useState(false);

  if (!driver) return null;

  const initials = driver.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Determine driver activity status
  const getDriverStatus = () => {
    if (stats.inProgress) {
      const s = stats.inProgress.status;
      if (s === 'in_progress') return { label: 'En viaje', color: 'text-online', bg: 'bg-online/15', dot: 'bg-online' };
      if (s === 'going_to_pickup') return { label: 'Buscando pasajero', color: 'text-accent-light', bg: 'bg-accent/15', dot: 'bg-accent' };
      if (s === 'accepted') return { label: 'Viaje aceptado', color: 'text-accent', bg: 'bg-accent/15', dot: 'bg-accent' };
    }
    if (driver.isOnline) return { label: 'Disponible', color: 'text-online', bg: 'bg-online/15', dot: 'bg-online' };
    return { label: 'Desconectado', color: 'text-offline', bg: 'bg-offline/15', dot: 'bg-offline' };
  };

  const driverStatus = getDriverStatus();

  // Filter trips by tab
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const filteredTrips = tab === 'today'
    ? trips.filter((t) => new Date(t.created_at) >= todayStart)
    : trips;

  return (
    <div className="w-96 bg-light-50 border-l border-light-300/50 flex flex-col h-full animate-slideIn">
      {/* Header */}
      <div className="p-4 border-b border-light-300/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-navy-900">Detalle del chofer</h3>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowVoice(!showVoice)}
              className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                showVoice
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-light-200 border-light-300/50 text-gray-400 hover:text-navy-800'
              }`}
              title="Radio / Mensajes de voz"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-navy-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Driver info card */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold ${
            driver.isOnline ? 'bg-online-dim text-online' : 'bg-light-300/50 text-gray-400'
          }`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-navy-900 truncate">{driver.fullName}</p>
              {driver.driverNumber && (
                <span className="text-[10px] font-bold text-accent bg-accent/15 px-1.5 py-0.5 rounded-md">#{driver.driverNumber}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                driver.vehicleType === 'moto'
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-accent/15 text-accent-light'
              }`}>
                {driver.vehicleType === 'moto' ? '🏍️' : '🚗'}
                {driver.vehicleType === 'moto' ? 'Moto' : 'Auto'}
              </span>
              <p className="text-xs text-gray-400 truncate">
                {driver.vehicleBrand} {driver.vehicleModel} · {driver.vehiclePlate}
              </p>
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center justify-between">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${driverStatus.bg} ${driverStatus.color}`}>
            <span className={`w-2 h-2 rounded-full ${driverStatus.dot}`} />
            {driverStatus.label}
          </div>
          {driver.isOnline && !stats.inProgress ? (
            <button
              onClick={() => onAssignTrip(driver)}
              className="text-xs font-medium text-accent hover:text-accent-light transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Asignar viaje
            </button>
          ) : (
            <span className="text-[10px] text-gray-500">
              {stats.inProgress ? 'En viaje activo' : 'No disponible'}
            </span>
          )}
        </div>
      </div>

      {showVoice ? (
        <VoiceChat driver={driver} onClose={() => setShowVoice(false)} />
      ) : (
      <>
      {/* Active trip banner */}
      {stats.inProgress && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-accent/10 border border-accent/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            <span className="text-xs font-semibold text-accent">Viaje activo</span>
          </div>
          <p className="text-xs text-gray-300 truncate">{stats.inProgress.passenger_name}</p>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">
            → {stats.inProgress.destination_address}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
            <span>{formatPrice(stats.inProgress.price)}</span>
            <span>·</span>
            <span>{formatKm(stats.inProgress.distance_km)}</span>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="p-4">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Estadísticas de hoy</p>
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="Viajes" value={stats.todayTrips} icon="🚗" />
          <StatBox label="Ingresos" value={formatPrice(stats.todayEarnings)} icon="💰" />
          <StatBox label="Kilómetros" value={formatKm(stats.todayKm)} icon="📍" />
          <StatBox label="Completados" value={stats.completed} icon="✅" sub={`de ${stats.total}`} />
        </div>

        {/* All-time summary row */}
        <div className="flex gap-2 mt-2">
          <div className="flex-1 bg-light-200/80 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500">Total ganado</p>
            <p className="text-sm font-bold text-green-400">{formatPrice(stats.totalEarnings)}</p>
          </div>
          <div className="flex-1 bg-light-200/80 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500">Total km</p>
            <p className="text-sm font-bold text-accent">{formatKm(stats.totalKm)}</p>
          </div>
          <div className="flex-1 bg-light-200/80 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500">Cancelados</p>
            <p className="text-sm font-bold text-danger">{stats.cancelled}</p>
          </div>
        </div>

        {/* Commission section */}
        <div className={`mt-3 rounded-xl border p-3 ${
          stats.isOverdue
            ? 'bg-danger/10 border-danger/30'
            : stats.commissionBalance > 0
              ? 'bg-amber-500/10 border-amber-500/25'
              : 'bg-light-200/80 border-light-300/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">💰</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Comisiones ({commissionPercent}%)</span>
            </div>
            {stats.isOverdue && (
              <span className="text-[9px] font-bold text-danger bg-danger/15 px-1.5 py-0.5 rounded-md animate-pulse">
                ⚠️ VENCIDA
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 text-center">
              <p className="text-[9px] text-gray-500">Acumulado</p>
              <p className="text-sm font-bold text-amber-400">{formatPrice(stats.totalCommission)}</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[9px] text-gray-500">Pagado</p>
              <p className="text-sm font-bold text-green-400">{formatPrice(stats.totalPaid)}</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[9px] text-gray-500">Deuda</p>
              <p className={`text-sm font-bold ${stats.commissionBalance > 0 ? (stats.isOverdue ? 'text-danger' : 'text-amber-400') : 'text-green-400'}`}>
                {formatPrice(stats.commissionBalance)}
              </p>
            </div>
          </div>
          {stats.commissionBalance > 0 && (
            <div className="mt-2 pt-2 border-t border-light-300/30">
              {payingCommission ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Monto"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="flex-1 bg-light-200 border border-light-300/50 rounded-lg px-2 py-1.5 text-xs text-navy-900 focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={async () => {
                      const amount = parseFloat(payAmount);
                      if (!amount || amount <= 0) return;
                      await supabase.from('commission_payments').insert({
                        driver_id: driver.id,
                        amount: Math.min(amount, stats.commissionBalance),
                        notes: `Pago desde dashboard`,
                      });
                      setPayAmount('');
                      setPayingCommission(false);
                      refetchPayments();
                    }}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-[10px] font-semibold text-white transition-colors"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => { setPayingCommission(false); setPayAmount(''); }}
                    className="px-2 py-1.5 bg-light-200 rounded-lg text-[10px] text-gray-400 hover:text-navy-800 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPayAmount(String(stats.commissionBalance)); setPayingCommission(true); }}
                    className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-green-600/15 text-green-400 hover:bg-green-600/25 transition-colors"
                  >
                    Registrar pago total
                  </button>
                  <button
                    onClick={() => setPayingCommission(true)}
                    className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-light-200 text-gray-400 hover:text-navy-800 transition-colors"
                  >
                    Pago parcial
                  </button>
                </div>
              )}
            </div>
          )}
          {stats.lastPayment && (
            <p className="text-[9px] text-gray-500 mt-1.5">
              Último pago: {formatDateTime(stats.lastPayment)}
            </p>
          )}
        </div>
      </div>

      {/* Trips tabs */}
      <div className="px-4 flex gap-1 bg-light-300/40 mx-4 rounded-lg p-1">
        {[
          { key: 'today', label: 'Hoy' },
          { key: 'all', label: 'Historial' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
              tab === t.key
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-gray-400 hover:text-navy-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Trip list */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-light-200/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">Sin viajes</p>
            <p className="text-gray-600 text-xs mt-1">
              {tab === 'today' ? 'No hay viajes registrados hoy' : 'No hay historial de viajes'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTrips.map((trip) => (
              <TripRow key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function StatBox({ label, value, icon, sub }) {
  return (
    <div className="bg-light-200/80 border border-light-300/30 rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-xs">{icon}</span>
      </div>
      <p className="text-sm font-bold text-navy-900">
        {value}
        {sub && <span className="text-[10px] font-normal text-gray-500 ml-1">{sub}</span>}
      </p>
    </div>
  );
}

function TripRow({ trip }) {
  const status = getTripStatus(trip.status);

  return (
    <div className="bg-light-200/60 border border-light-300/30 rounded-xl p-3 hover:bg-light-300/60 transition-colors">
      {/* Top: passenger + status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-xs font-medium text-navy-900 truncate">{trip.passenger_name}</span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Route */}
      <div className="space-y-1 mb-2">
        <div className="flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-online mt-1.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-300 truncate">{trip.origin_address}</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-300 truncate">{trip.destination_address}</p>
        </div>
      </div>

      {/* Bottom: price, km, time */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span className="font-semibold text-green-400">{formatPrice(trip.price)}</span>
        {parseFloat(trip.commission_amount) > 0 && (
          <span className="font-semibold text-amber-400">-{formatPrice(trip.commission_amount)}</span>
        )}
        <span>·</span>
        <span>{formatKm(trip.distance_km)}</span>
        <span>·</span>
        <span>{formatDuration(trip.duration_minutes)}</span>
        <span className="ml-auto">{formatTime(trip.created_at)}</span>
      </div>
    </div>
  );
}
