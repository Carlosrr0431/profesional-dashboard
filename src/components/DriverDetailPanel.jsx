import { useState, useEffect, useCallback } from 'react';
import { formatPrice, formatKm, formatDuration, formatDateTime, formatTime, getTripStatus, timeAgo } from '../lib/utils';
import { filterPaymentsByPeriod, sumPaymentAmounts, paymentSourceLabel, toAnchorString } from '../lib/commissionPaymentPeriods';
import CommissionPeriodPicker from './CommissionPeriodPicker';
import { formatError } from '../lib/errorFormat';
import { useToast } from '../context/ToastContext';
import { isFleetRoot, isAssignedDriver } from '../lib/driverRoles';
import AssignedDriversTab from './AssignedDriversTab';
import DriverAvatar from './DriverAvatar';

export default function DriverDetailPanel({
  driver,
  onClose,
  onEdit,
  getDriverTrips,
  getDriverCommissionPayments,
  recordCommissionPayment,
  toggleCommissionBlock,
  fetchAssignedDrivers,
  createAssignedDriver,
  deleteAssignedDriver,
  toggleAssignedDriverStatus,
  assignedCount = 0,
  partnerOwners = [],
}) {
  const toast = useToast();
  const [trips, setTrips] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const [tripFilter, setTripFilter] = useState('all');
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([
        getDriverTrips(driver.id),
        getDriverCommissionPayments(driver.id),
      ]);
      setTrips(t);
      setPayments(p);
    } catch (err) {
      console.error('Driver detail load error:', formatError(err));
    } finally {
      setLoading(false);
    }
  }, [driver.id, getDriverTrips, getDriverCommissionPayments]);

  useEffect(() => { loadData(); }, [loadData]);

  // Stats
  const completed = trips.filter((t) => t.status === 'completed');
  const cancelled = trips.filter((t) => t.status === 'cancelled');
  const totalEarnings = completed.reduce((s, t) => s + (parseFloat(t.price) || 0), 0);
  const totalKm = completed.reduce((s, t) => s + (parseFloat(t.distance_km) || 0), 0);
  const totalCommission = completed.reduce((s, t) => s + (parseFloat(t.commission_amount) || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const commissionBalance = Math.round((totalCommission - totalPaid) * 100) / 100;

  // Today stats
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayTrips = completed.filter((t) => new Date(t.completed_at) >= todayStart);
  const todayEarnings = todayTrips.reduce((s, t) => s + (parseFloat(t.price) || 0), 0);
  const todayCommission = todayTrips.reduce((s, t) => s + (parseFloat(t.commission_amount) || 0), 0);

  // Overdue check
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const oldestUnpaid = completed
    .filter((t) => parseFloat(t.commission_amount) > 0)
    .filter((t) => {
      const lastPay = payments.length > 0 ? new Date(payments[0].created_at) : null;
      return !lastPay || new Date(t.completed_at) > lastPay;
    })
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at))[0];
  const isOverdue = commissionBalance > 0 && oldestUnpaid && new Date(oldestUnpaid.completed_at) < threeDaysAgo;

  // Filtered trips
  const filteredTrips = trips.filter((t) => {
    if (tripFilter === 'completed') return t.status === 'completed';
    if (tripFilter === 'cancelled') return t.status === 'cancelled';
    if (tripFilter === 'active') return ['accepted', 'going_to_pickup', 'in_progress', 'pending'].includes(t.status);
    return true;
  });

  const handlePay = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      toast.warning('Ingresá un monto válido');
      return;
    }
    setPaying(true);
    try {
      const result = await recordCommissionPayment(driver.id, amount, payNotes);
      setPayAmount('');
      setPayNotes('');
      setShowPayForm(false);
      await loadData();
      toast.success(`Pago parcial de ${formatPrice(amount)} registrado`);
      if (result?.pending_commission === 0) {
        toast.info('El chofer quedó al día con sus comisiones');
      }
    } catch (err) {
      console.error('Driver payment error:', formatError(err));
      toast.error(err?.message || 'No se pudo registrar el pago');
    } finally {
      setPaying(false);
    }
  };

  const handleToggleBlock = async () => {
    setShowSettleConfirm(true);
  };

  const handleConfirmToggleBlock = async () => {
    setBlocking(true);
    try {
      const result = await toggleCommissionBlock(driver.id);
      setShowSettleConfirm(false);
      await loadData();
      const amountPaid = parseFloat(result?.amountPaid || driver.pending_commission || commissionBalance || 0);
      if (amountPaid > 0) {
        toast.success(`Pago total de ${formatPrice(amountPaid)} registrado`);
      } else {
        toast.info('El chofer ya no tiene comisión pendiente');
      }
    } catch (err) {
      console.error('Toggle block error:', formatError(err));
      toast.error(err?.message || 'No se pudo registrar el pago');
    } finally {
      setBlocking(false);
    }
  };

  const canManageAssigned = isFleetRoot(driver);

  return (
    <div className="relative w-[440px] shrink-0 min-h-0 h-full bg-light-50 border-l border-light-300/50 flex flex-col animate-slideIn overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-light-300/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <DriverAvatar
              photoUrl={driver.photo_url}
              name={driver.full_name}
              size="lg"
              online={Boolean(driver.is_available)}
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-bold text-navy-900">{driver.full_name}</h3>
                {driver.driver_number && (
                  <span className="text-[10px] font-bold text-accent bg-accent/15 px-1.5 py-0.5 rounded-md">#{driver.driver_number}</span>
                )}
                {!isAssignedDriver(driver) && partnerOwners.length > 0 ? (
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-md">Socio</span>
                ) : null}
              </div>
              <p className="text-xs text-gray-500">
                {driver.vehicle_type === 'moto' ? '🏍️' : '🚗'} {driver.vehicle_brand} {driver.vehicle_model} · {driver.vehicle_plate}
              </p>
              {!isAssignedDriver(driver) && partnerOwners.length > 0 ? (
                <p className="text-[11px] text-teal-700 mt-0.5">
                  Socio de {partnerOwners.map((p) => p.full_name).filter(Boolean).join(', ')}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="w-8 h-8 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-navy-900 transition-all" title="Editar">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 bg-light-300/60 rounded-xl p-1">
          {[
            { key: 'info', label: 'Resumen' },
            { key: 'trips', label: `Viajes (${trips.length})` },
            { key: 'commission', label: 'Comisiones', alert: driver.pending_commission > 0 || driver.commission_blocked },
            ...(canManageAssigned
              ? [{ key: 'assigned', label: `Asignados (${assignedCount})` }]
              : []),
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-[11px] font-medium py-2 rounded-lg transition-all relative ${
                tab === t.key ? 'bg-accent text-white shadow-md shadow-accent/20' : 'text-gray-400 hover:text-navy-900'
              }`}
            >
              {t.label}
              {t.alert && tab !== t.key && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-danger" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {tab === 'info' && (
              <InfoTab
                driver={driver}
                stats={{ completed: completed.length, cancelled: cancelled.length, totalEarnings, totalKm, todayTrips: todayTrips.length, todayEarnings }}
              />
            )}
            {tab === 'trips' && (
              <TripsTab
                trips={filteredTrips}
                tripFilter={tripFilter}
                setTripFilter={setTripFilter}
                totalTrips={trips.length}
                completedCount={completed.length}
                cancelledCount={cancelled.length}
              />
            )}
            {tab === 'commission' && (
              <CommissionTab
                driver={driver}
                totalCommission={totalCommission}
                totalPaid={totalPaid}
                commissionBalance={commissionBalance}
                isOverdue={isOverdue}
                todayCommission={todayCommission}
                payments={payments}
                showPayForm={showPayForm}
                setShowPayForm={setShowPayForm}
                payAmount={payAmount}
                setPayAmount={setPayAmount}
                payNotes={payNotes}
                setPayNotes={setPayNotes}
                paying={paying}
                onPay={handlePay}
                onPayFull={() => setShowSettleConfirm(true)}
                onToggleBlock={handleToggleBlock}
                blocking={blocking}
              />
            )}
            {tab === 'assigned' && canManageAssigned ? (
              <AssignedDriversTab
                ownerDriver={driver}
                partnerOwners={partnerOwners}
                fetchAssignedDrivers={fetchAssignedDrivers}
                createAssignedDriver={createAssignedDriver}
                deleteAssignedDriver={deleteAssignedDriver}
                toggleAssignedDriverStatus={toggleAssignedDriverStatus}
                getDriverTrips={getDriverTrips}
              />
            ) : null}
          </>
        )}
      </div>

      {showSettleConfirm && (
        <ConfirmCommissionPaymentModal
          driver={driver}
          amount={parseFloat(driver?.pending_commission || commissionBalance || 0)}
          loading={blocking}
          onCancel={() => setShowSettleConfirm(false)}
          onConfirm={handleConfirmToggleBlock}
        />
      )}
    </div>
  );
}

function ConfirmCommissionPaymentModal({ driver, amount, loading, onCancel, onConfirm }) {
  return (
    <div className="absolute inset-0 z-[120] bg-navy-900/45 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-light-50 rounded-2xl border border-light-300/50 shadow-2xl shadow-navy-900/25 overflow-hidden">
        <div className="px-5 py-4 border-b border-light-300/40">
          <h3 className="text-sm font-bold text-navy-900">Confirmar Pago de Comision</h3>
          <p className="text-xs text-gray-500 mt-1">Se registrara un pago total para este chofer.</p>
        </div>

        <div className="px-5 py-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Chofer</span>
            <span className="font-semibold text-navy-900">{driver?.full_name || 'Sin nombre'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Monto a registrar</span>
            <span className="font-bold text-online">{formatPrice(amount)}</span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-light-300/40 flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 text-xs font-medium text-gray-600 bg-light-200 border border-light-300/60 rounded-xl hover:bg-light-300/60 disabled:opacity-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-online to-emerald-500 rounded-xl hover:shadow-lg hover:shadow-online/20 disabled:opacity-50 transition-all"
          >
            {loading ? 'Registrando...' : 'Confirmar Pago'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Info Tab ─── */
function InfoTab({ driver, stats }) {
  const rows = [
    { label: 'Teléfono', value: driver.phone || '—' },
    { label: 'Tipo', value: driver.vehicle_type === 'moto' ? '🏍️ Moto' : '🚗 Auto' },
    { label: 'Vehículo', value: `${driver.vehicle_brand || ''} ${driver.vehicle_model || ''}`.trim() || '—' },
    { label: 'Patente', value: driver.vehicle_plate || '—' },
    { label: 'Color', value: driver.vehicle_color || '—' },
    { label: 'Licencia', value: driver.license_expiry || '—' },
    { label: 'Rating', value: `⭐ ${parseFloat(driver.rating || 5).toFixed(1)}` },
    { label: 'Registrado', value: driver.created_at ? new Date(driver.created_at).toLocaleDateString('es-AR') : '—' },
  ];

  return (
    <div className="p-5 pb-8 space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Viajes Hoy" value={stats.todayTrips} color="text-accent" />
        <StatCard label="Ganancia Hoy" value={formatPrice(stats.todayEarnings)} color="text-online" />
        <StatCard label="Total Viajes" value={stats.completed} color="text-navy-900" />
        <StatCard label="Total Ganado" value={formatPrice(stats.totalEarnings)} color="text-navy-900" />
        <StatCard label="KM Totales" value={formatKm(stats.totalKm)} color="text-gray-500" />
        <StatCard label="Cancelados" value={stats.cancelled} color="text-danger" />
      </div>

      {/* Personal details */}
      <div className="bg-light-200/50 rounded-xl border border-light-300/30 divide-y divide-light-300/30">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs text-gray-500">{r.label}</span>
            <span className="text-xs font-medium text-navy-900">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-light-200/50 rounded-xl border border-light-300/30 p-3 text-center">
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <p className={`text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

/* ─── Trips Tab ─── */
function TripsTab({ trips, tripFilter, setTripFilter, totalTrips, completedCount, cancelledCount }) {
  const activeCount = totalTrips - completedCount - cancelledCount;

  return (
    <div className="pb-8">
      {/* Sub-filter */}
      <div className="px-5 py-3 border-b border-light-300/30">
        <div className="flex gap-1 flex-wrap">
          {[
            { key: 'all', label: `Todos (${totalTrips})` },
            { key: 'completed', label: `Completados (${completedCount})` },
            { key: 'cancelled', label: `Cancelados (${cancelledCount})` },
            { key: 'active', label: `Activos (${activeCount})` },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setTripFilter(f.key)}
              className={`text-[10px] font-medium px-2.5 py-1.5 rounded-lg transition-all ${
                tripFilter === f.key ? 'bg-navy-900 text-white' : 'bg-light-200 text-gray-400 hover:text-navy-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trip list */}
      <div>
        {trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-10 h-10 mb-2 text-light-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-xs">Sin viajes</p>
          </div>
        ) : (
          trips.map((trip) => <TripRow key={trip.id} trip={trip} />)
        )}
      </div>
    </div>
  );
}

function TripRow({ trip }) {
  const status = getTripStatus(trip.status);
  return (
    <div className="px-5 py-3 border-b border-light-300/20 hover:bg-light-200/30 transition-all">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
          <span className="text-[10px] text-gray-500">{formatDateTime(trip.created_at)}</span>
        </div>
        {trip.price != null && (
          <span className="text-sm font-bold text-navy-900">{formatPrice(trip.price)}</span>
        )}
      </div>
      <p className="text-xs text-navy-900 font-medium truncate">👤 {trip.passenger_name || 'Sin nombre'}</p>
      <div className="mt-1 space-y-0.5">
        <p className="text-[11px] text-gray-500 truncate">
          <span className="text-online">●</span> {trip.origin_address || '—'}
        </p>
        <p className="text-[11px] text-gray-500 truncate">
          <span className="text-accent">●</span> {trip.destination_address || '—'}
        </p>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
        {trip.distance_km != null && <span>{formatKm(trip.distance_km)}</span>}
        {trip.duration_minutes != null && <span>{formatDuration(trip.duration_minutes)}</span>}
        {trip.commission_amount > 0 && (
          <span className="text-amber-500">Comisión: {formatPrice(trip.commission_amount)}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Commission Tab ─── */
function CommissionTab({
  driver, totalCommission, totalPaid, commissionBalance, isOverdue, todayCommission,
  payments, showPayForm, setShowPayForm, payAmount, setPayAmount, payNotes, setPayNotes,
  paying, onPay, onPayFull, onToggleBlock, blocking,
}) {
  const [paymentPeriod, setPaymentPeriod] = useState('all');
  const [paymentAnchor, setPaymentAnchor] = useState(() => toAnchorString(new Date()));
  const isBlocked = driver?.commission_blocked || false;
  const pendingFromDB = parseFloat(driver?.pending_commission || 0);
  const displayPending = pendingFromDB > 0 ? pendingFromDB : Math.max(0, commissionBalance);
  const filteredPayments = filterPaymentsByPeriod(payments, paymentPeriod, new Date(), paymentAnchor);
  const periodPaid = sumPaymentAmounts(filteredPayments);
  const weekPaid = sumPaymentAmounts(filterPaymentsByPeriod(payments, 'week', new Date(), toAnchorString(new Date())));
  const monthPaid = sumPaymentAmounts(filterPaymentsByPeriod(payments, 'month', new Date(), toAnchorString(new Date())));

  const handlePaymentModeChange = (nextMode) => {
    setPaymentPeriod(nextMode);
    if (nextMode !== 'all') {
      setPaymentAnchor(toAnchorString(new Date()));
    }
  };

  return (
    <div className="p-5 pb-8 space-y-4">
      {/* Block status banner */}
      {isBlocked && (
        <div className="flex items-center justify-between bg-danger/10 border border-danger/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-danger flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            <div>
              <p className="text-xs font-bold text-danger">Chofer Bloqueado</p>
              <p className="text-[10px] text-danger/70">No puede tomar viajes hasta regularizar comisión</p>
            </div>
          </div>
          <button
            onClick={onToggleBlock}
            disabled={blocking}
            className="text-[10px] font-bold text-white bg-online px-3 py-1.5 rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-all"
          >
            {blocking ? '...' : 'Marcar Pagado'}
          </button>
        </div>
      )}

      {/* Balance card */}
      <div className={`rounded-xl border p-4 ${isOverdue || isBlocked ? 'bg-danger/5 border-danger/20' : commissionBalance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-online/5 border-online/20'}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-500">Balance de Comisión</span>
          <div className="flex items-center gap-1.5">
            {isOverdue && (
              <span className="text-[10px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full">⚠️ VENCIDA</span>
            )}
            {!isBlocked && commissionBalance > 0 && (
              <button
                onClick={onToggleBlock}
                disabled={blocking}
                className="text-[10px] font-bold text-danger bg-danger/10 px-2.5 py-0.5 rounded-full hover:bg-danger/20 disabled:opacity-50 transition-all"
                title="Registrar pago total de comision"
              >
                {blocking ? '...' : 'Marcar pagado'}
              </button>
            )}
          </div>
        </div>
        <p className={`text-2xl font-bold ${isOverdue || isBlocked ? 'text-danger' : displayPending > 0 ? 'text-amber-600' : 'text-online'}`}>
          ${displayPending.toFixed(2)}
        </p>
        <p className="text-[10px] text-gray-500 mt-1">
          {displayPending <= 0 ? 'Al día ✓' : `Debe $${displayPending.toFixed(2)} de comisión`}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-light-200/50 rounded-xl border border-light-300/30 p-3 text-center">
          <p className="text-[10px] text-gray-500">Total Generado</p>
          <p className="text-sm font-bold text-navy-900">{formatPrice(totalCommission)}</p>
        </div>
        <div className="bg-light-200/50 rounded-xl border border-light-300/30 p-3 text-center">
          <p className="text-[10px] text-gray-500">Pagado (semana)</p>
          <p className="text-sm font-bold text-online">{formatPrice(weekPaid)}</p>
        </div>
        <div className="bg-light-200/50 rounded-xl border border-light-300/30 p-3 text-center">
          <p className="text-[10px] text-gray-500">Pagado (mes)</p>
          <p className="text-sm font-bold text-online">{formatPrice(monthPaid)}</p>
        </div>
      </div>

      {/* Pay button */}
      {displayPending > 0 && !showPayForm && (
        <div className="flex gap-2">
          <button
            onClick={onPayFull}
            className="flex-1 py-2.5 bg-gradient-to-r from-online to-emerald-500 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-online/20 transition-all"
          >
            Pagar Todo ({formatPrice(displayPending)})
          </button>
          <button
            onClick={() => setShowPayForm(true)}
            className="py-2.5 px-4 bg-light-200 border border-light-300/50 text-navy-900 text-sm font-medium rounded-xl hover:bg-light-300/50 transition-all"
          >
            Parcial
          </button>
        </div>
      )}

      {/* Pay form */}
      {showPayForm && (
        <div className="bg-light-200/50 border border-light-300/30 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold text-navy-900">Registrar Pago</h4>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold block mb-1">Monto ($)</label>
            <input
              type="number"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              min="1"
              className="w-full bg-light-50 border border-light-300/50 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold block mb-1">Notas (opcional)</label>
            <input
              type="text"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              className="w-full bg-light-50 border border-light-300/50 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
              placeholder="Ej: Pago en efectivo"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowPayForm(false); setPayAmount(''); setPayNotes(''); }}
              className="flex-1 py-2 text-xs text-gray-500 bg-light-200 border border-light-300/50 rounded-lg hover:bg-light-300/50 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={onPay}
              disabled={paying || !payAmount || parseFloat(payAmount) <= 0}
              className="flex-[2] py-2 text-xs font-semibold text-white bg-gradient-to-r from-online to-emerald-500 rounded-lg disabled:opacity-50 transition-all"
            >
              {paying ? 'Registrando...' : `Registrar ${formatPrice(parseFloat(payAmount) || 0)}`}
            </button>
          </div>
        </div>
      )}

      {/* Payment history */}
      <div>
        <h4 className="text-xs font-semibold text-navy-900 mb-2">Historial de Pagos</h4>
        <CommissionPeriodPicker
          compact
          useModal
          mode={paymentPeriod}
          onModeChange={handlePaymentModeChange}
          anchorDate={paymentAnchor}
          onAnchorChange={setPaymentAnchor}
        />
        {paymentPeriod !== 'all' ? (
          <p className="text-[10px] text-gray-500 mt-2 mb-2">
            Total del período: <span className="font-semibold text-online">{formatPrice(periodPaid)}</span>
            {' · '}Histórico: {formatPrice(totalPaid)}
          </p>
        ) : null}
        {filteredPayments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Sin pagos en este período</p>
        ) : (
          <div className="space-y-1.5 mt-2">
            {filteredPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-light-200/50 border border-light-300/20 rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-online">{formatPrice(p.amount)}</p>
                  <p className="text-[10px] text-gray-500">
                    {paymentSourceLabel(p.payment_source, p.notes)}
                    {p.notes && p.payment_source !== 'paypertic' ? ` · ${p.notes}` : ''}
                  </p>
                </div>
                <span className="text-[10px] text-gray-400">{formatDateTime(p.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
