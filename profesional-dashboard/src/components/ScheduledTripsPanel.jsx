import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskPhone(phone) {
  const p = String(phone || '');
  if (p.length < 6) return p;
  return `+${p.slice(0, 2)} *** ${p.slice(-4)}`;
}

function formatWhen(msUntil) {
  if (msUntil === null) return { label: '—', color: 'text-gray-400' };
  if (msUntil < 0) return { label: 'Pasado', color: 'text-danger' };
  const min = Math.ceil(msUntil / 60000);
  if (min < 1) return { label: 'Ahora mismo', color: 'text-warning font-bold' };
  if (min < 30) return { label: `en ${min} min`, color: 'text-warning font-semibold' };
  if (min < 60) return { label: `en ${min} min`, color: 'text-amber-600' };
  const h = Math.floor(min / 60);
  const m = min % 60;
  const str = m > 0 ? `en ${h}h ${m}m` : `en ${h}h`;
  if (h < 4) return { label: str, color: 'text-blue-600' };
  return { label: str, color: 'text-gray-500' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="relative flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
      </span>
      <span className="text-[11px] font-medium text-violet-600">En vivo</span>
    </span>
  );
}

function StatCard({ label, value, sub, color = 'violet' }) {
  const colors = {
    violet: { ring: 'border-violet-200 from-violet-50', val: 'text-violet-700' },
    amber:  { ring: 'border-warning/25 from-warning/8', val: 'text-warning' },
    blue:   { ring: 'border-blue-200 from-blue-50', val: 'text-blue-700' },
    slate:  { ring: 'border-slate-200 from-slate-50', val: 'text-slate-600' },
  }[color] || { ring: 'border-light-300 from-light-100', val: 'text-navy-800' };

  return (
    <div className={`flex-1 rounded-2xl border bg-gradient-to-br ${colors.ring} to-white px-4 py-3`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colors.val}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function UrgencyBadge({ urgency, countdown }) {
  const styles = {
    imminent: 'bg-warning/15 text-warning border-warning/35',
    soon:     'bg-blue-500/12 text-blue-600 border-blue-400/30',
    normal:   'bg-light-200 text-gray-500 border-light-300',
    past:     'bg-danger/12 text-danger border-danger/30',
  };
  const icons = {
    imminent: '⚡',
    soon:     '🕐',
    normal:   '📅',
    past:     '⚠️',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${styles[urgency] || styles.normal}`}>
      <span>{icons[urgency] || '📅'}</span>
      {countdown}
    </span>
  );
}

function ScheduledTripCard({ trip, onCancel }) {
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { label: whenLabel, color: whenColor } = formatWhen(trip.msUntil);

  const handleCancel = async () => {
    if (!confirmCancel) { setConfirmCancel(true); return; }
    setCancelling(true);
    try {
      await onCancel(trip.id);
    } catch {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const ar = trip.arFormatted;
  const urgencyCls = {
    imminent: 'border-warning/30 bg-gradient-to-r from-warning/5 to-transparent shadow-sm shadow-warning/10',
    soon:     'border-blue-300/30 bg-gradient-to-r from-blue-50/60 to-transparent',
    normal:   'border-light-300/60 bg-white/80 hover:border-light-400',
    past:     'border-danger/25 bg-danger/3',
  }[trip.urgency] || 'border-light-300/60 bg-white/80';

  return (
    <div className={`relative rounded-2xl border p-4 transition-all ${urgencyCls}`}>
      {/* Top row: date block + name + urgency */}
      <div className="flex items-start gap-3">

        {/* Date block */}
        <div className={`flex-shrink-0 w-14 rounded-xl overflow-hidden border text-center ${
          trip.urgency === 'imminent' ? 'border-warning/40 bg-warning/10' :
          trip.urgency === 'past'     ? 'border-danger/30 bg-danger/8' :
                                        'border-light-300 bg-light-100'
        }`}>
          <div className={`py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            trip.urgency === 'imminent' ? 'bg-warning/20 text-warning' :
            trip.urgency === 'past'     ? 'bg-danger/15 text-danger' :
                                          'bg-light-200 text-gray-400'
          }`}>
            {ar?.wday ?? '—'}
          </div>
          <div className={`py-1.5 ${
            trip.urgency === 'imminent' ? 'text-warning' :
            trip.urgency === 'past'     ? 'text-danger' :
                                          'text-navy-900'
          }`}>
            <p className="text-lg font-bold leading-none tabular-nums">{ar?.day ?? '—'}</p>
            <p className="text-[10px] font-medium text-gray-400 mt-0.5">{ar?.month ?? '—'}</p>
          </div>
          <div className={`py-1 border-t font-bold tabular-nums text-sm ${
            trip.urgency === 'imminent' ? 'border-warning/25 text-warning bg-warning/5' :
            trip.urgency === 'past'     ? 'border-danger/20 text-danger bg-danger/5' :
                                          'border-light-300/60 text-navy-800 bg-white/50'
          }`}>
            {ar?.time ?? '—'}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-bold text-navy-900 leading-tight">{trip.passenger_name || 'Pasajero'}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{maskPhone(trip.phone)}</p>
            </div>
            <UrgencyBadge urgency={trip.urgency} countdown={trip.countdown} />
          </div>

          {/* Pickup */}
          <div className="flex items-start gap-1.5 mt-2.5">
            <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <p className="text-[12px] font-medium text-navy-800 leading-snug">{trip.destination_address || '—'}</p>
          </div>

          {/* Display text / confirmación */}
          {trip.displayText && (
            <p className="text-[11px] text-gray-400 mt-1.5 italic">"{trip.displayText}"</p>
          )}

          {/* ID + timestamp */}
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-light-200/70">
            <p className="text-[10px] text-gray-300">
              #{String(trip.id).slice(0, 8)} · Reservado {new Date(trip.created_at).toLocaleString('es-AR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
              })}
            </p>
            {/* Cancel */}
            {trip.urgency !== 'past' && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all ${
                  confirmCancel
                    ? 'bg-danger text-white hover:bg-danger/80'
                    : 'text-danger/70 hover:text-danger hover:bg-danger/8 border border-transparent hover:border-danger/20'
                } disabled:opacity-50`}
              >
                {cancelling ? '...' : confirmCancel ? '¿Confirmar cancelación?' : 'Cancelar'}
              </button>
            )}
            {confirmCancel && !cancelling && (
              <button
                onClick={() => setConfirmCancel(false)}
                className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1"
              >
                No
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineMarker({ trip }) {
  const ar = trip.arFormatted;
  const { color } = formatWhen(trip.msUntil);
  return (
    <div className={`flex items-center gap-2 py-1.5 ${trip.urgency === 'past' ? 'opacity-40' : ''}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
        trip.urgency === 'imminent' ? 'bg-warning animate-pulse' :
        trip.urgency === 'soon' ? 'bg-blue-500' :
        trip.urgency === 'past' ? 'bg-danger/50' :
        'bg-violet-400'
      }`} />
      <span className="text-[11px] font-bold text-navy-900 tabular-nums w-11 flex-shrink-0">{ar?.time ?? '—'}</span>
      <span className="text-[11px] text-navy-800 truncate font-medium">{trip.passenger_name || 'Pasajero'}</span>
      <span className={`text-[10px] ml-auto flex-shrink-0 ${color}`}>{trip.countdown}</span>
    </div>
  );
}

function EmptyScheduled() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-navy-800">Sin viajes programados</p>
      <p className="text-xs text-gray-400 mt-1.5 max-w-[200px]">
        Los viajes agendados por WhatsApp aparecerán acá automáticamente
      </p>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ScheduledTripsPanel({
  trips,
  stats,
  loading,
  lastUpdated,
  refetch,
  cancelScheduledTrip,
  onBack,
}) {
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  // Tick cada segundo para actualizar cuentas regresivas visualmente
  useEffect(() => {
    const t = setInterval(() => setTick((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    toast.success('Viajes programados actualizados');
  };

  const handleCancelTrip = async (tripId) => {
    try {
      await cancelScheduledTrip(tripId);
      toast.success('Viaje programado cancelado');
    } catch (err) {
      toast.error(err?.message || 'No se pudo cancelar el viaje');
      throw err;
    }
  };

  // Separar por urgencia para el orden visual
  const imminentTrips = trips.filter((t) => t.urgency === 'imminent');
  const soonTrips     = trips.filter((t) => t.urgency === 'soon');
  const normalTrips   = trips.filter((t) => t.urgency === 'normal');
  const pastTrips     = trips.filter((t) => t.urgency === 'past');

  const activeTrips = [...imminentTrips, ...soonTrips, ...normalTrips];

  // void tick usage to prevent lint warning (forces re-render for countdown)
  void tick;

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full bg-light-100/60 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:px-6 lg:py-4 bg-white/80 border-b border-light-300/60 backdrop-blur-sm flex-shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-light-100 border border-light-300/60 flex items-center justify-center text-gray-500 hover:text-navy-800 hover:bg-light-200 transition-all"
            title="Volver al mapa"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/30">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>

          <div className="min-w-0">
            <h2 className="text-navy-900 font-bold text-base leading-tight">Viajes programados</h2>
            <p className="hidden text-[11px] text-gray-400 sm:block">
              Reservas por WhatsApp · Suscripto en tiempo real ·{' '}
              {lastUpdated
                ? `Actualizado ${lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'Cargando...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LiveDot />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-navy-700 bg-light-200 border border-light-300/60 hover:bg-light-300/60 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-4 flex-shrink-0 w-full lg:px-6">
        <StatCard
          label="Programados"
          value={loading ? '—' : stats.total}
          sub={stats.total === 0 ? 'Ninguno pendiente' : `${stats.total} en agenda`}
          color="violet"
        />
        <StatCard
          label="Inminentes"
          value={loading ? '—' : stats.imminent}
          sub="< 30 min"
          color="amber"
        />
        <StatCard
          label="Próximas 2h"
          value={loading ? '—' : stats.soon}
          sub="pronto a despachar"
          color="blue"
        />
        <StatCard
          label="Hoy"
          value={loading ? '—' : stats.today}
          sub="reservas del día"
          color="slate"
        />
      </div>

      {/* ── Body (dos columnas a ancho completo) ───────────────────────────── */}
      <div className="flex-1 min-h-0 w-full grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,32%)] gap-5 px-4 pb-6 overflow-hidden lg:px-6">

        {/* ── Agenda de viajes ───────────────────────────────────────────── */}
        <div className="flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-navy-900">Agenda de viajes</h3>
              {stats.total > 0 && (
                <span className="text-[11px] font-bold text-white bg-violet-500 rounded-full px-1.5 py-0.5 leading-tight">
                  {stats.total}
                </span>
              )}
              {stats.imminent > 0 && (
                <span className="text-[11px] font-bold text-warning bg-warning/15 border border-warning/30 rounded-full px-1.5 py-0.5 leading-tight animate-pulse">
                  ⚡ {stats.imminent} inminente{stats.imminent !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400">Ordenado por hora de programación</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : trips.length === 0 ? (
              <EmptyScheduled />
            ) : (
              <>
                {/* Inminentes (< 30 min) */}
                {imminentTrips.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse inline-block" />
                      Inminentes
                    </p>
                    <div className="space-y-2.5">
                      {imminentTrips.map((t) => (
                        <ScheduledTripCard key={t.id} trip={t} onCancel={handleCancelTrip} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Próximas 2h */}
                {soonTrips.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                      Próximas 2 horas
                    </p>
                    <div className="space-y-2.5">
                      {soonTrips.map((t) => (
                        <ScheduledTripCard key={t.id} trip={t} onCancel={handleCancelTrip} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Resto */}
                {normalTrips.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                      Programados
                    </p>
                    <div className="space-y-2.5">
                      {normalTrips.map((t) => (
                        <ScheduledTripCard key={t.id} trip={t} onCancel={handleCancelTrip} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Pasados */}
                {pastTrips.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-danger/60 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger/50 inline-block" />
                      Hora pasada (pendiente de despacho)
                    </p>
                    <div className="space-y-2.5">
                      {pastTrips.map((t) => (
                        <ScheduledTripCard key={t.id} trip={t} onCancel={handleCancelTrip} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Línea de tiempo ────────────────────────────────────────────── */}
        <div className="flex flex-col min-w-0 min-h-0 xl:border-l xl:border-light-300/60 xl:pl-5">
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <h3 className="text-sm font-bold text-navy-900">Línea de tiempo</h3>
            <span className="text-[10px] text-gray-400">próximas reservas</span>
          </div>

          <div className="flex-1 min-h-[200px] xl:min-h-0 overflow-y-auto bg-white/70 border border-light-300/60 rounded-2xl px-4 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-7 h-7 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : activeTrips.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-400">Sin próximos viajes</p>
              </div>
            ) : (
              <div>
                {/* Agrupar por día */}
                {(() => {
                  const groups = {};
                  for (const t of activeTrips) {
                    const ar = t.arFormatted;
                    const key = ar ? `${ar.wday} ${ar.day}/${ar.month}` : '—';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(t);
                  }
                  return Object.entries(groups).map(([dayKey, dayTrips]) => (
                    <div key={dayKey} className="mb-4 last:mb-0">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 pb-1.5 border-b border-light-200">
                        {dayKey}
                      </p>
                      <div className="space-y-0.5">
                        {dayTrips.map((t) => (
                          <TimelineMarker key={t.id} trip={t} />
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Nota informativa */}
          <div className="mt-3 p-3 bg-violet-50 border border-violet-100 rounded-xl flex-shrink-0">
            <p className="text-[10px] text-violet-600 font-medium leading-relaxed">
              🚕 Los viajes programados pasan a cola automáticamente 5 minutos antes de la hora reservada (cron dispatch-worker). El pasajero recibe un aviso por WhatsApp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
